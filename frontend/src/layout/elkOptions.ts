/**
 * Pre-registered ELK options.
 *
 * These are a frozen constant. They are not tuned per fixture, per malformed
 * case, or to make a screenshot or timing bound look better. If a performance
 * bound is missed, the measurement is reported and options are proposed; this
 * block is not changed.
 */

export const ELK_ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
  'elk.spacing.nodeNode': '72',
  'elk.layered.spacing.nodeNodeBetweenLayers': '128',
  'elk.spacing.edgeNode': '40',
  'elk.spacing.edgeEdge': '32',
  'elk.spacing.labelNode': '24',
  'elk.spacing.labelEdge': '24',
  'elk.padding': '[top=64,left=48,bottom=48,right=48]',
};

/** The same padding block is set on every group container. */
export const ELK_GROUP_OPTIONS: Record<string, string> = {
  'elk.padding': ELK_ROOT_OPTIONS['elk.padding'],
};
