import { ChevronDown, FolderPlus, MoreHorizontal, PlusCircle, Rows } from 'lucide-react'
import { JSX, memo, useMemo, useState } from 'react'
import type { Category } from 'shared/types'
import { useAuth } from '../../contexts/AuthContext'
import { trpc } from '../../utils/trpc'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { CategoryForm } from './CategoryForm'
import { CategoryListItem } from './CategoryListItem'
import { CategoryTemplateList } from './CategoryTemplateList'

export const CategoryManagementSettings = memo(function CategoryManagementSettings(): JSX.Element {
  console.log('CategoryManagementSettings re-rendered')
  const { token } = useAuth()
  const utils = trpc.useUtils()
  const {
    data: categories,
    isLoading,
    error: fetchError
  } = trpc.category.getCategories.useQuery(
    { token: token || '' },
    {
      enabled: !!token,
      select: (data) =>
        data?.map((category) => ({
          ...category,
          createdAt: category.createdAt, // Removed new Date() conversion
          updatedAt: category.updatedAt // Removed new Date() conversion
        }))
    }
  )
  const createMutation = trpc.category.createCategory.useMutation({
    onSuccess: () => {
      utils.category.getCategories.invalidate({ token: token || '' })
      setIsFormOpen(false)
      setEditingCategory(null)
      setTemplateData(null)
    },
    onError: (err) => {
      console.error('Error creating category:', err)
      alert(`Error creating category: ${err.message}`)
    }
  })
  const updateMutation = trpc.category.updateCategory.useMutation({
    onSuccess: () => {
      utils.category.getCategories.invalidate({ token: token || '' })
      setIsFormOpen(false)
      setEditingCategory(null)
      setTemplateData(null)
    },
    onError: (err) => {
      console.error('Error updating category:', err)
      alert(`Error updating category: ${err.message}`)
    }
  })
  const deleteMutation = trpc.category.deleteCategory.useMutation({
    onSuccess: (_data) => {
      utils.category.getCategories.invalidate({ token: token || '' })
    },
    onError: (err) => {
      alert(`Error deleting category: ${err.message}`)
    }
  })

  const deleteRecentMutation = trpc.category.deleteRecentlyCreatedCategories.useMutation({
    onSuccess: () => {
      utils.category.getCategories.invalidate({ token: token || '' })
      alert('Recently created categories have been deleted.')
    },
    onError: (err) => {
      alert(`Error deleting recent categories: ${err.message}`)
    }
  })

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isTemplateViewOpen, setIsTemplateViewOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [templateData, setTemplateData] = useState<Omit<
    Category,
    '_id' | 'userId' | 'createdAt' | 'updatedAt'
  > | null>(null)

  const handleAddNew = () => {
    setEditingCategory(null)
    setTemplateData(null)
    setIsFormOpen(true)
  }

  const handleOpenTemplateView = () => {
    setIsTemplateViewOpen(true)
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setTemplateData(null)
    setIsFormOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!token) {
      alert('Authentication token not found. Please log in again.')
      return
    }
    if (window.confirm('Are you sure you want to delete this category?')) {
      await deleteMutation.mutateAsync({ id, token })
    }
  }

  const handleDeleteRecent = async () => {
    if (!token) {
      alert('Authentication token not found. Please log in again.')
      return
    }
    if (window.confirm('Are you sure you want to delete recently created categories?')) {
      await deleteRecentMutation.mutateAsync({ token })
    }
  }

  const handleSaveCategory = async (
    data: Omit<Category, '_id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!token) {
      alert('Authentication token not found. Please log in again.')
      return
    }
    if (editingCategory) {
      await updateMutation.mutateAsync({ id: editingCategory._id, ...data, token })
    } else {
      await createMutation.mutateAsync({ ...data, token })
    }
  }

  const handleAddFromTemplate = async (
    data: Omit<Category, '_id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    // Instead of directly creating, pass the template data to the form
    setTemplateData(data)
    setEditingCategory(null)
    setIsTemplateViewOpen(false)
    setIsFormOpen(true)
  }

  const handleToggleProductive = async (category: Category) => {
    if (!token) {
      alert('Authentication token not found. Please log in again.')
      return
    }
    await updateMutation.mutateAsync({
      id: category._id,
      isProductive: !category.isProductive,
      token
    })
  }

  const handleToggleArchive = async (category: Category) => {
    if (!token) {
      alert('Authentication token not found. Please log in again.')
      return
    }
    await updateMutation.mutateAsync({
      id: category._id,
      isArchived: !category.isArchived,
      token
    })
  }

  const handleArchiveAll = async () => {
    if (!token) {
      alert('Authentication token not found. Please log in again.')
      return
    }
    if (window.confirm('Are you sure you want to archive all categories?')) {
      // Archive all active categories
      const activeCategories = categories?.filter((c) => !c.isArchived) || []
      for (const category of activeCategories) {
        await updateMutation.mutateAsync({
          id: category._id,
          isArchived: true,
          token
        })
      }
    }
  }

  const memoizedInitialData = useMemo(() => {
    return editingCategory || templateData || undefined
  }, [editingCategory, templateData])

  if (!token && !isLoading) {
    return (
      <div className="p-4 text-center text-yellow-500 bg-yellow-100 border border-yellow-500 rounded-md">
        Please log in to manage categories.
      </div>
    )
  }

  const activeCategories = categories?.filter((c) => !c.isArchived) || []
  const archivedCategories = categories?.filter((c) => c.isArchived) || []

  if (isLoading)
    return <div className="text-center p-4 text-muted-foreground">Loading categories...</div>
  if (fetchError)
    return (
      <div className="text-center p-4 text-destructive-foreground">
        Error loading categories: {fetchError.message}
      </div>
    )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl mb-1">Manage Categories</CardTitle>
            <CardDescription>
              Create from scratch or from templates. Ensure there is no overlap between categories
              e.g. archive "Work" after you crate more specific work/project categories.
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isFormOpen || isTemplateViewOpen}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDeleteRecent}
                  disabled={
                    !token ||
                    deleteRecentMutation.isLoading ||
                    createMutation.isLoading ||
                    updateMutation.isLoading ||
                    deleteMutation.isLoading
                  }
                  className="text-red-500"
                >
                  Delete Created in last 24 hours
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleArchiveAll}
                  disabled={
                    !token ||
                    createMutation.isLoading ||
                    updateMutation.isLoading ||
                    deleteMutation.isLoading ||
                    !categories?.some((c) => !c.isArchived)
                  }
                >
                  Archive All Categories
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center text-sm font-medium"
                  disabled={!token || isFormOpen || isTemplateViewOpen}
                >
                  Add Category
                  <ChevronDown size={18} className="ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleOpenTemplateView}>
                  <Rows size={18} className="mr-2" />
                  From Templates
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddNew}>
                  <PlusCircle size={18} className="mr-2" />
                  New Category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {isTemplateViewOpen && (
            <CategoryTemplateList
              onAdd={handleAddFromTemplate}
              onCancel={() => setIsTemplateViewOpen(false)}
              existingCategories={categories || []}
              isSaving={createMutation.isLoading}
            />
          )}

          {isFormOpen && (
            <div className="p-4 border rounded-lg my-4">
              <h3 className="text-lg font-semibold leading-none tracking-tight">
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                {editingCategory
                  ? 'Edit the details of your category.'
                  : 'Create a new category to organize your activities.'}
              </p>
              <CategoryForm
                initialData={memoizedInitialData}
                onSave={handleSaveCategory}
                onCancel={() => {
                  setIsFormOpen(false)
                  setEditingCategory(null)
                  setTemplateData(null)
                }}
                isSaving={createMutation.isLoading || updateMutation.isLoading}
              />
            </div>
          )}

          {!isFormOpen && !isTemplateViewOpen && (!categories || categories.length === 0) && (
            <div className="text-center py-8 px-4 bg-muted/50 rounded-lg border border-dashed border-border">
              <FolderPlus className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No categories yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get started by creating a new category.
              </p>
              <div className="mt-6">
                <Button
                  onClick={handleAddNew}
                  type="button"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary"
                  disabled={!token}
                >
                  <PlusCircle size={20} className="-ml-1 mr-2 h-5 w-5" />
                  New Category
                </Button>
              </div>
            </div>
          )}

          {!isFormOpen && !isTemplateViewOpen && activeCategories.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 w-full mx-auto bg-transparent p-0">
              {activeCategories.map((category, idx) => (
                <div key={category._id}>
                  <CategoryListItem
                    category={category}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleProductive={handleToggleProductive}
                    onToggleArchive={handleToggleArchive}
                    isDeleting={
                      deleteMutation.isLoading && deleteMutation.variables?.id === category._id
                    }
                    isUpdating={
                      updateMutation.isLoading && updateMutation.variables?.id === category._id
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {!isFormOpen && !isTemplateViewOpen && archivedCategories.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-medium text-foreground mb-4">Archived Categories</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 w-full mx-auto bg-transparent p-0">
                {archivedCategories.map((category, idx) => (
                  <div key={category._id}>
                    <CategoryListItem
                      category={category}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggleProductive={handleToggleProductive}
                      onToggleArchive={handleToggleArchive}
                      isDeleting={
                        deleteMutation.isLoading && deleteMutation.variables?.id === category._id
                      }
                      isUpdating={
                        updateMutation.isLoading && updateMutation.variables?.id === category._id
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})
