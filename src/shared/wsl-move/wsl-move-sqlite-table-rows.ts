import type { WslMoveFieldDisposition } from './wsl-move-dispositions'

/** One disposition row per `<database>.<table>` key. */
export const tables = (
  database: string,
  names: readonly string[],
  row: WslMoveFieldDisposition
): [string, WslMoveFieldDisposition][] => names.map((name) => [`${database}.${name}`, row])
