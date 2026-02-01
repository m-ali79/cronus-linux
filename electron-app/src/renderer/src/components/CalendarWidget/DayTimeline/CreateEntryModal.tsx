import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Category } from 'shared/types'
import { z } from 'zod'
import { useAuth } from '../../../contexts/AuthContext'
import { useCategorySelection } from '../../../hooks/useCategorySelection'
import { CanonicalBlock } from '../../../lib/dayTimelineHelpers'
import { trpc } from '../../../utils/trpc'
import { CategoryBadge } from '../../CategoryBadge'
import { CategoryForm } from '../../Settings/CategoryForm'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { CustomCategorySelectionPopover } from './CustomCategorySelectionPopover'

interface CreateEntryModalProps {
  isOpen: boolean
  onClose: () => void
  startTime: { hour: number; minute: number } | null
  endTime: { hour: number; minute: number } | null
  onSubmit: (data: { name: string; categoryId?: string }) => void
  onDelete: (id: string) => void
  existingEntry: CanonicalBlock | null
}

const formSchema = z.object({
  name: z.string().min(1, 'Entry name is required'),
  categoryId: z.string().optional()
})

export const CreateEntryModal = ({
  isOpen,
  onClose,
  startTime,
  endTime,
  onSubmit,
  onDelete,
  existingEntry
}: CreateEntryModalProps) => {
  const { token } = useAuth()
  const { data: categoriesData, isLoading } = trpc.category.getCategories.useQuery(
    { token: token || '' },
    { enabled: !!token && isOpen }
  )

  const { data: historyData, isLoading: isLoadingHistory } =
    trpc.activeWindowEvents.getManualEntryHistory.useQuery(
      { token: token || '' },
      { enabled: !!token && isOpen }
    )

  const categories = useMemo(() => {
    if (!categoriesData) return []
    return categoriesData.map((cat) => ({
      ...cat,
      createdAt: new Date(cat.createdAt),
      updatedAt: new Date(cat.updatedAt)
    }))
  }, [categoriesData])

  const utils = trpc.useUtils()
  const createCategoryMutation = trpc.category.createCategory.useMutation()

  const {
    formState: { errors, isSubmitting },
    reset
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema)
  })

  const [inputValue, setInputValue] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const {
    searchResults,
    templateResults,
    historyResults,
    isPopoverOpen,
    setIsPopoverOpen,
    highlightedIndex,
    setHighlightedIndex,
    showCreateOption,
    handleKeyDown
  } = useCategorySelection({
    categories,
    historyData,
    inputValue,
    selectedCategory
  })

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      inputRef.current?.focus()
      setIsPopoverOpen(true) // Show dropdown immediately when modal opens
    }, 100)
    return () => clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isPopoverOpen) return

    const handleClick = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [isPopoverOpen])

  useEffect(() => {
    if (isOpen && !existingEntry) {
      reset()
      setInputValue('')
      setSelectedCategory(null)
      setShowCategoryForm(false)
      setIsPopoverOpen(true) // Show dropdown when modal opens with no existing entry
    }
  }, [isOpen, existingEntry, reset])

  useEffect(() => {
    if (isOpen && existingEntry) {
      setInputValue(existingEntry.name)
      if (existingEntry.categoryId && categories) {
        const category = categories.find((c) => c._id === existingEntry.categoryId)
        setSelectedCategory(category || null)
      } else {
        setSelectedCategory(null)
      }
    }
  }, [isOpen, existingEntry, categories])

  const handleSelectHistory = (item: { title: string | null; categoryId: string | null }) => {
    setInputValue(item.title || '')
    if (item.categoryId) {
      const category = categories.find((c) => c._id === item.categoryId)
      if (category) {
        setSelectedCategory(category)
      }
    }
    setIsPopoverOpen(false)
    inputRef.current?.focus()
  }

  const handleSelectCategory = (category: Category) => {
    setSelectedCategory(category)
    setInputValue(category.name)
    setIsPopoverOpen(false)
    inputRef.current?.focus()
  }

  const handleFormSubmit = () => {
    if (!inputValue && !selectedCategory) {
      return
    }
    const finalName = inputValue || selectedCategory?.name || 'Untitled'
    onSubmit({ name: finalName, categoryId: selectedCategory?._id })
    reset()
    setInputValue('')
    setSelectedCategory(null)
  }

  const handleSaveNewCategory = async (
    data: Omit<Category, '_id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!token) return
    try {
      const newCategory = (await createCategoryMutation.mutateAsync({
        ...data,
        token
      })) as Category
      utils.category.getCategories.invalidate({ token: token || '' })
      setSelectedCategory(newCategory)
      setInputValue('')
      if (showCategoryForm) {
        setShowCategoryForm(false)
      }
    } catch (err) {
      alert(`Error creating category: ${(err as Error).message}`)
    }
  }

  const formatTime = (time: { hour: number; minute: number }) => {
    return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
  }

  const getDialogDescription = () => {
    if (existingEntry) {
      return `Editing entry: ${existingEntry.name}`
    }
    if (startTime && endTime) {
      return `Adding a new entry from ${formatTime(startTime)} to ${formatTime(endTime)}.`
    }
    return ''
  }

  if (!isOpen) {
    return null
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} />
      <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg">
        <div className="max-h-[80vh] overflow-y-auto -m-6 p-6">
          {showCategoryForm ? (
            <>
              <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                <h3 className="text-lg font-semibold leading-none tracking-tight">
                  Create New Category
                </h3>
                <p className="text-sm text-muted-foreground">
                  Create a new category to organize your time entries.
                </p>
              </div>
              <CategoryForm
                initialData={{ name: inputValue, isProductive: true }}
                onSave={handleSaveNewCategory}
                onCancel={() => setShowCategoryForm(false)}
                isSaving={createCategoryMutation.isLoading}
              />
            </>
          ) : (
            <>
              <div className="flex flex-col space-y-1.5 text-center sm:text-left mb-4">
                <h3 className="text-lg font-semibold leading-none tracking-tight">
                  {existingEntry ? 'Edit Entry' : 'Create New Entry'}
                </h3>
                <p className="text-sm text-muted-foreground">{getDialogDescription()}</p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleFormSubmit()
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Entry Title or Category Search</Label>
                  <Input
                    id="name"
                    placeholder="Search for a category or type a title"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value)
                      if (!isPopoverOpen) setIsPopoverOpen(true)
                    }}
                    onFocus={() => setIsPopoverOpen(true)} // Show dropdown on focus
                    onKeyDown={(e) =>
                      handleKeyDown(
                        e,
                        handleSelectHistory,
                        handleSelectCategory,
                        (template) => {
                          handleSaveNewCategory(template)
                          setIsPopoverOpen(false)
                        },
                        () => {
                          setIsPopoverOpen(false)
                          setShowCategoryForm(true)
                        },
                        handleFormSubmit
                      )
                    }
                    ref={inputRef}
                    autoComplete="off"
                  />
                </div>
                {isPopoverOpen && (
                  <CustomCategorySelectionPopover
                    ref={popoverRef}
                    anchorEl={inputRef}
                    historyResults={historyResults}
                    searchResults={searchResults}
                    templateResults={templateResults}
                    highlightedIndex={highlightedIndex}
                    showCreateOption={showCreateOption}
                    inputValue={inputValue}
                    onSelectHistory={handleSelectHistory}
                    onSelectCategory={handleSelectCategory}
                    onSelectTemplate={(template) => {
                      handleSaveNewCategory(template)
                      setIsPopoverOpen(false)
                    }}
                    onShowCategoryForm={() => {
                      setIsPopoverOpen(false)
                      setShowCategoryForm(true)
                    }}
                    onHighlight={setHighlightedIndex}
                  />
                )}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {selectedCategory && (
                      <div className="flex flex-row gap-2 items-center">
                        <Label>Selected Category</Label>
                        <CategoryBadge
                          category={selectedCategory}
                          onClear={() => setSelectedCategory(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                  {existingEntry && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        if (existingEntry._id) {
                          onDelete(existingEntry._id)
                        }
                      }}
                      className="mr-auto"
                    >
                      Delete
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {existingEntry ? 'Save' : 'Create'}
                  </Button>
                </div>
              </form>
            </>
          )}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>
    </>
  )
}
