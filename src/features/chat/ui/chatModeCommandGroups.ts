import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';

/**
 * A category's commands, ready to render as one labelled section.
 *
 * `heading` is null for commands whose definition declares no `category`.
 */
export interface ChatModeCommandGroup {
  readonly commands: readonly ProviderCommandEntry[];
  readonly heading: string | null;
}

/**
 * Leading "12. " marks an explicit ordering position and is not displayed.
 *
 * Vault command categories describe a workflow, so alphabetical order would
 * scramble them. The prefix lets a vault pick the order without Claudian
 * knowing anything about that vault's categories.
 */
const ORDER_PREFIX = /^\s*(\d+)\s*\.\s*/;

interface CategoryOrder {
  readonly heading: string;
  readonly position: number;
  readonly rank: number;
}

function readCategory(raw: string): CategoryOrder {
  const match = ORDER_PREFIX.exec(raw);
  if (!match) {
    return { heading: raw.trim(), position: 0, rank: 1 };
  }
  return {
    heading: raw.slice(match[0].length).trim(),
    position: Number.parseInt(match[1], 10),
    rank: 0,
  };
}

function byName(left: ProviderCommandEntry, right: ProviderCommandEntry): number {
  return left.name.localeCompare(right.name);
}

export function groupCommandsByCategory(
  entries: readonly ProviderCommandEntry[],
): readonly ChatModeCommandGroup[] {
  const categorized = new Map<string, { order: CategoryOrder; commands: ProviderCommandEntry[] }>();
  const uncategorized: ProviderCommandEntry[] = [];

  for (const entry of entries) {
    const raw = entry.category?.trim();
    if (!raw) {
      uncategorized.push(entry);
      continue;
    }
    const order = readCategory(raw);
    const existing = categorized.get(order.heading);
    if (existing) {
      existing.commands.push(entry);
      continue;
    }
    categorized.set(order.heading, { order, commands: [entry] });
  }

  const groups: ChatModeCommandGroup[] = [...categorized.values()]
    .sort((left, right) => (
      left.order.rank - right.order.rank
      || left.order.position - right.order.position
      || left.order.heading.localeCompare(right.order.heading)
    ))
    .map(({ order, commands }) => ({
      commands: [...commands].sort(byName),
      heading: order.heading,
    }));

  if (uncategorized.length > 0) {
    groups.push({ commands: [...uncategorized].sort(byName), heading: null });
  }
  return groups;
}
