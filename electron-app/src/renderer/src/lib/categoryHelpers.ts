import { type ComparableCategory } from 'shared/categories'
import type { Category } from 'shared/types'

export function checkCategoriesAgainstDefaults(
  currentCategories: Category[] | undefined,
  defaults: ComparableCategory[]
): boolean {
  if (!currentCategories) {
    // If currentCategories is undefined (e.g. loading), or null
    // they are not considered matching the defaults.
    return false
  }

  // Normalize current categories for comparison
  const normalizedCurrentCategories: ComparableCategory[] = currentCategories.map((cat) => ({
    name: cat.name,
    description: cat.description || '', // Treat undefined/null description as empty string
    color: cat.color.toUpperCase(),
    isProductive: cat.isProductive,
    isDefault: cat.isDefault
  }))

  const normalizedDefaults: ComparableCategory[] = defaults.map((def) => ({
    ...def,
    description: def.description || '', // Treat undefined/null description as empty string
    color: def.color.toUpperCase(),
    isDefault: def.isDefault
  }))

  if (normalizedCurrentCategories.length !== normalizedDefaults.length) {
    return false // Different number of categories
  }

  for (const defaultCat of normalizedDefaults) {
    const currentCatMatch = normalizedCurrentCategories.find((cc) => cc.name === defaultCat.name)

    if (!currentCatMatch) {
      return false // A default category name is missing from current
    }

    // Compare properties
    if (
      currentCatMatch.description !== defaultCat.description ||
      currentCatMatch.isProductive !== defaultCat.isProductive ||
      currentCatMatch.isDefault !== defaultCat.isDefault
    ) {
      return false // Properties don't match
    }
  }

  return true // All defaults found and match current categories
}
