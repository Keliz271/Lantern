export type ExecutionNode = { value: string; label: string; host: string };
export type ExecutionNodeId = string;

export const DEFAULT_EXECUTION_NODES: readonly ExecutionNode[] = Object.freeze([
  { value: 'node-1', label: 'Node 1 (192.168.1.10)', host: '192.168.1.10' },
  { value: 'node-2', label: 'Node 2 (192.168.1.11)', host: '192.168.1.11' }
]);

const cloneExecutionNodes = (nodes: readonly ExecutionNode[]) => nodes.map((node) => ({ ...node }));

export const parseExecutionNodes = (
  raw: string | null | undefined,
  fallbackNodes: readonly ExecutionNode[] = DEFAULT_EXECUTION_NODES
): ExecutionNode[] => {
  const entries = String(raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [value = '', label = '', host = ''] = part.split('|').map((item) => item.trim());
      if (!value || !host) return null;
      const normalizedLabel = label || `${value} (${host})`;
      return { value, label: normalizedLabel, host } satisfies ExecutionNode;
    })
    .filter((entry): entry is ExecutionNode => Boolean(entry));
  return entries.length > 0 ? entries : cloneExecutionNodes(fallbackNodes);
};
