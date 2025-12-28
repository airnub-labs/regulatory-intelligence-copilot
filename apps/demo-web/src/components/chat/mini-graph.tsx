'use client'

import { Badge } from '@/components/ui/badge'

interface MiniGraphNode {
  id: string
  label: string
  type?: string
  source?: 'current' | 'prior'
}

interface MiniGraphProps {
  nodes: MiniGraphNode[]
  maxNodes?: number
}

const getNodeTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    'Benefit': 'bg-green-500',
    'Rule': 'bg-blue-500',
    'Jurisdiction': 'bg-purple-500',
    'Regulation': 'bg-orange-500',
    'Other': 'bg-gray-500',
  }
  return colors[type] || colors['Other']
}

export function MiniGraph({ nodes, maxNodes = 15 }: MiniGraphProps) {
  const displayNodes = nodes.slice(0, maxNodes)
  const hasMore = nodes.length > maxNodes

  if (displayNodes.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
        No nodes to display
      </div>
    )
  }

  // Group nodes by type for better visualization
  const groupedByType = displayNodes.reduce((acc, node) => {
    const type = node.type || 'Other'
    if (!acc[type]) acc[type] = []
    acc[type].push(node)
    return acc
  }, {} as Record<string, MiniGraphNode[]>)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-md">
        {Object.entries(groupedByType).map(([type, typeNodes]) => (
          <div key={type} className="flex flex-wrap gap-1.5">
            {typeNodes.map((node) => (
              <div
                key={node.id}
                className="group relative"
                title={`${node.label}${node.source ? ` (${node.source})` : ''}`}
              >
                <div
                  className={`
                    flex items-center justify-center
                    h-8 min-w-[32px] px-2
                    rounded-md text-white text-[10px] font-medium
                    ${getNodeTypeColor(type)}
                    ${node.source === 'prior' ? 'opacity-60' : 'opacity-100'}
                    hover:scale-110 transition-transform
                    cursor-pointer
                  `}
                >
                  {node.label.substring(0, 3).toUpperCase()}
                </div>
                {node.source === 'current' && (
                  <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border border-white" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center text-xs text-muted-foreground">
          +{nodes.length - maxNodes} more nodes
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.keys(groupedByType).map((type) => (
          <Badge
            key={type}
            variant="outline"
            className={`text-[10px] ${
              type === 'Benefit' ? 'border-green-500 text-green-700 dark:text-green-300' :
              type === 'Rule' ? 'border-blue-500 text-blue-700 dark:text-blue-300' :
              type === 'Jurisdiction' ? 'border-purple-500 text-purple-700 dark:text-purple-300' :
              type === 'Regulation' ? 'border-orange-500 text-orange-700 dark:text-orange-300' :
              'border-gray-500 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${getNodeTypeColor(type)}`} />
            {type} ({groupedByType[type].length})
          </Badge>
        ))}
      </div>
    </div>
  )
}
