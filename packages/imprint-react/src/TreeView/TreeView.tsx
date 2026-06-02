import {
  TreeView as ArkTreeView,
  createTreeCollection,
  type TreeViewExpandedChangeDetails,
  type TreeViewRootProps,
  type TreeViewSelectionChangeDetails
} from '@ark-ui/react'
import { ChevronRight, FileText, Folder, FolderOpen, type LucideIcon } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'

import styles from './TreeView.module.css'

export type { TreeViewExpandedChangeDetails, TreeViewSelectionChangeDetails }

/** A single node in the tree. Branches are nodes that declare `children`. */
export interface TreeNode {
  /** Stable unique id used for expansion/selection state. */
  value: string
  /** Visible label. */
  label: string
  /** Child nodes. Presence marks the node as an expandable branch. */
  children?: TreeNode[]
  /**
   * Optional leading icon (a lucide-react component). When omitted, branches
   * default to a folder icon and leaves to a document icon, matching the
   * specimen.
   */
  icon?: LucideIcon
  /** Disables interaction on this node. */
  disabled?: boolean
}

type RootForwardedProps = Pick<
  TreeViewRootProps<TreeNode>,
  | 'expandedValue'
  | 'defaultExpandedValue'
  | 'selectedValue'
  | 'defaultSelectedValue'
  | 'selectionMode'
  | 'expandOnClick'
  | 'id'
>

export interface TreeViewProps extends RootForwardedProps {
  /** The tree data. Top-level nodes shown under an invisible root. */
  data: TreeNode[]
  /** Accessible label for the tree, rendered as a visually hidden heading. */
  label: ReactNode
  /** Fires when a branch expands or collapses. */
  onExpandedChange?: (details: TreeViewExpandedChangeDetails<TreeNode>) => void
  /** Fires when the selection changes. */
  onSelectionChange?: (details: TreeViewSelectionChangeDetails<TreeNode>) => void
  /** Extra className merged onto the root element. */
  className?: string
}

const ROOT_VALUE = 'ROOT'

/** Recursively renders a node — a branch (with children) or a leaf item. */
function TreeNodeView({ node, indexPath }: { node: TreeNode; indexPath: number[] }): ReactNode {
  const isBranch = node.children != null && node.children.length > 0

  if (isBranch) {
    const BranchIcon = node.icon
    return (
      <ArkTreeView.NodeProvider key={node.value} node={node} indexPath={indexPath}>
        <ArkTreeView.Branch className={styles.branch}>
          <ArkTreeView.BranchControl className={styles.control}>
            <ArkTreeView.BranchIndicator className={styles.indicator}>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </ArkTreeView.BranchIndicator>
            <span className={styles.icon}>{BranchIcon ? <BranchIcon aria-hidden="true" /> : <BranchFolderIcon />}</span>
            <ArkTreeView.BranchText className={styles.text}>{node.label}</ArkTreeView.BranchText>
          </ArkTreeView.BranchControl>
          <ArkTreeView.BranchContent className={styles.content}>
            <ArkTreeView.BranchIndentGuide className={styles.indentGuide} />
            {node.children?.map((child, index) => (
              <TreeNodeView key={child.value} node={child} indexPath={[...indexPath, index]} />
            ))}
          </ArkTreeView.BranchContent>
        </ArkTreeView.Branch>
      </ArkTreeView.NodeProvider>
    )
  }

  const LeafIcon = node.icon ?? FileText
  return (
    <ArkTreeView.NodeProvider key={node.value} node={node} indexPath={indexPath}>
      <ArkTreeView.Item className={styles.item}>
        <span className={styles.icon}>
          <LeafIcon aria-hidden="true" />
        </span>
        <ArkTreeView.ItemText className={styles.text}>{node.label}</ArkTreeView.ItemText>
      </ArkTreeView.Item>
    </ArkTreeView.NodeProvider>
  )
}

/**
 * Renders the open/closed folder icon for a branch driven by Ark's
 * `data-state`. Sits inside `.icon`; the closed/open variants are toggled with
 * CSS so the icon tracks the branch state without JS.
 */
function BranchFolderIcon() {
  return (
    <>
      <FolderOpen aria-hidden="true" className={styles.folderOpen} />
      <Folder aria-hidden="true" className={styles.folderClosed} />
    </>
  )
}

/**
 * Imprint TreeView. Ark UI's headless tree (roving focus, type-ahead,
 * arrow-key navigation, expand/collapse, ARIA `tree`/`treeitem`/`group` wiring)
 * skinned entirely with Imprint tokens. Indentation, chevron rotation, the
 * folder open/closed glyphs, and the accent selection fill are 1:1 with the
 * Imprint specimen.
 *
 * The ref forwards to the tree's root element.
 */
export const TreeView = forwardRef<HTMLDivElement, TreeViewProps>(function TreeView(
  { data, label, onExpandedChange, onSelectionChange, className, ...rest },
  ref
) {
  const collection = createTreeCollection<TreeNode>({
    rootNode: { children: data, label: ROOT_VALUE, value: ROOT_VALUE },
    isNodeDisabled: node => node.disabled ?? false,
    nodeToChildren: node => node.children ?? [],
    nodeToString: node => node.label,
    nodeToValue: node => node.value
  })

  return (
    <ArkTreeView.Root
      ref={ref}
      collection={collection}
      onExpandedChange={onExpandedChange}
      onSelectionChange={onSelectionChange}
      className={className ? `${styles.root} ${className}` : styles.root}
      {...rest}
    >
      <ArkTreeView.Label className={styles.label}>{label}</ArkTreeView.Label>
      <ArkTreeView.Tree className={styles.tree}>
        {collection.rootNode.children?.map((node, index) => (
          <TreeNodeView key={node.value} node={node} indexPath={[index]} />
        ))}
      </ArkTreeView.Tree>
    </ArkTreeView.Root>
  )
})
