import type { Handle, HandleServerError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import {
  buildLanternUnauthorizedResponse,
  isLanternAuthEnabled,
  isLanternRequestAuthorized,
  validateCsrfRequestOrigin,
  validateRequestHost
} from '$serverlib/security';
import {
  captureServerException,
  initObservability,
  logEvent,
  shouldLogHttpRequest
} from '$serverlib/observability';

initObservability();

const CSRF_PROTECTED_POST_PATHS = new Set([
  '/api/config',
  '/api/background',
  '/api/monitor-test',
  '/api/health-test'
]);

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = event.request.headers.get('x-request-id')?.trim() || randomUUID();
  const startedAt = Date.now();
  const requestContext = {
    requestId,
    method: event.request.method,
    path: event.url.pathname
  };

  const finalize = (response: Response, outcome = 'http.request.complete') => {
    response.headers.set('x-request-id', requestId);
    if (shouldLogHttpRequest(event.url.pathname, response.status)) {
      logEvent('info', outcome, {
        ...requestContext,
        status: response.status,
        durationMs: Date.now() - startedAt
      });
    }
    return response;
  };

  try {
    const hostValidation = validateRequestHost(event.request);
    if (!hostValidation.ok) {
      return finalize(
        new Response(JSON.stringify({ error: hostValidation.message }), {
          status: 421,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        }),
        'http.request.host_blocked'
      );
    }

    if (
      event.request.method === 'POST' &&
      CSRF_PROTECTED_POST_PATHS.has(event.url.pathname)
    ) {
      const csrfValidation = validateCsrfRequestOrigin(event.request);
      if (!csrfValidation.ok) {
        return finalize(
          new Response(JSON.stringify({ error: csrfValidation.message }), {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            }
          }),
          'http.request.csrf_blocked'
        );
      }
    }

    if (!isLanternAuthEnabled()) {
      return finalize(await resolve(event));
    }

    if (event.request.method === 'OPTIONS') {
      return finalize(await resolve(event));
    }

    const authorizationHeader = event.request.headers.get('authorization');
    if (!isLanternRequestAuthorized(authorizationHeader)) {
      return finalize(buildLanternUnauthorizedResponse(), 'http.request.unauthorized');
    }

    return finalize(await resolve(event));
  } catch (error) {
    captureServerException(error, requestContext);
    throw error;
  }
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logEvent('error', 'http.request.error', {
    requestId: event.request.headers.get('x-request-id')?.trim() || randomUUID(),
    method: event.request.method,
    path: event.url.pathname,
    routeId: event.route.id ?? null,
    status,
    message,
    error
  });
  return {
    message: 'Internal server error'
  };
};
