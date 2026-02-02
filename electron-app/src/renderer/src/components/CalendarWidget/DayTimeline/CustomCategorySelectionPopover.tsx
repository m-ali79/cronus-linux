import { History, PlusCircle } from 'lucide-react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { type ComparableCategory } from 'shared/categories'
import type { Category } from 'shared/types'

type HistoryItem = {
  title: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
}

interface CustomCategorySelectionPopoverProps {
  historyResults: HistoryItem[] | undefined
  searchResults: Category[]
  templateResults: ComparableCategory[]
  highlightedIndex: number
  showCreateOption: boolean
  inputValue: string
  onSelectHistory: (item: HistoryItem) => void
  onSelectCategory: (category: Category) => void
  onSelectTemplate: (template: ComparableCategory) => void
  onShowCategoryForm: () => void
  onHighlight: (index: number) => void
  anchorEl: React.RefObject<HTMLInputElement | null>
}

export const CustomCategorySelectionPopover = forwardRef<
  HTMLDivElement,
  CustomCategorySelectionPopoverProps
>(
  (
    {
      historyResults,
      searchResults: searchCategoryResults,
      templateResults,
      highlightedIndex,
      showCreateOption,
      inputValue,
      onSelectHistory,
      onSelectCategory,
      onSelectTemplate,
      onShowCategoryForm,
      onHighlight,
      anchorEl
    },
    ref
  ) => {
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
    const resultsContainerRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<(HTMLDivElement | null)[]>([])

    useEffect(() => {
      if (anchorEl.current) {
        const rect = anchorEl.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width
        })
      }
    }, [anchorEl])

    useEffect(() => {
      if (itemRefs.current[highlightedIndex]) {
        itemRefs.current[highlightedIndex]?.scrollIntoView({
          block: 'nearest'
        })
      }
    }, [highlightedIndex])

    const allItems = [
      ...(historyResults || []),
      ...searchCategoryResults,
      ...templateResults,
      ...(showCreateOption ? [{ type: 'create' }] : [])
    ]

    if (!anchorEl.current) return null

    return (
      <div
        ref={ref}
        className="absolute z-50 rounded-md border bg-popover text-popover-foreground shadow-md outline-none mt-3"
        style={{
          width: `${position.width}px`
        }}
      >
        <div ref={resultsContainerRef} className="max-h-60 overflow-y-auto p-1">
          <div className="flex flex-col space-y-1">
            {historyResults && historyResults.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                  History
                </div>
                {historyResults.map((item, index) => (
                  <div
                    key={`${item.title}-${item.categoryId}`}
                    ref={(el) => {
                      itemRefs.current[index] = el
                    }}
                    onClick={() => onSelectHistory(item)}
                    onMouseEnter={() => onHighlight(index)}
                    className={`flex items-center cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none ${
                      highlightedIndex === index ? 'bg-accent' : ''
                    }`}
                  >
                    <History className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-semibold truncate block">{item.title}</span>
                      {item.categoryName && (
                        <div className="flex items-center text-xs text-muted-foreground">
                          <span
                            className="mr-1.5 h-2 w-2 rounded-full"
                            style={{ backgroundColor: item.categoryColor || '#808080' }}
                          ></span>
                          {item.categoryName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            {searchCategoryResults.map((cat, index) => (
              <div
                key={cat._id}
                ref={(el) => {
                  itemRefs.current[index + (historyResults?.length || 0)] = el
                }}
                onClick={() => onSelectCategory(cat)}
                onMouseEnter={() => onHighlight(index + (historyResults?.length || 0))}
                className={`flex items-center cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none ${
                  highlightedIndex === index + (historyResults?.length || 0) ? 'bg-accent' : ''
                }`}
              >
                <span
                  className="mr-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                ></span>
                {cat.name}
              </div>
            ))}
            {templateResults.map((template, index) => (
              <div
                key={template.name}
                ref={(el) => {
                  itemRefs.current[
                    searchCategoryResults.length + index + (historyResults?.length || 0)
                  ] = el
                }}
                onClick={() => onSelectTemplate(template)}
                onMouseEnter={() =>
                  onHighlight(searchCategoryResults.length + index + (historyResults?.length || 0))
                }
                className={`flex items-center cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none ${
                  highlightedIndex ===
                  searchCategoryResults.length + index + (historyResults?.length || 0)
                    ? 'bg-accent'
                    : ''
                }`}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>
                  Create from template:{' '}
                  <span className="font-semibold truncate block">{template.name}</span>
                </span>
              </div>
            ))}
            {showCreateOption && (
              <div
                ref={(el) => {
                  itemRefs.current[
                    searchCategoryResults.length +
                      templateResults.length +
                      (historyResults?.length || 0)
                  ] = el
                }}
                onClick={onShowCategoryForm}
                onMouseEnter={() =>
                  onHighlight(
                    searchCategoryResults.length +
                      templateResults.length +
                      (historyResults?.length || 0)
                  )
                }
                className={`flex items-center cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none ${
                  highlightedIndex ===
                  searchCategoryResults.length +
                    templateResults.length +
                    (historyResults?.length || 0)
                    ? 'bg-accent'
                    : ''
                }`}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create category "{inputValue}"
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
)

CustomCategorySelectionPopover.displayName = 'CustomCategorySelectionPopover'
