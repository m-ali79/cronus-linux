import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { trpc } from '../../utils/trpc'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'

export const MultiPurposeWebsitesSettings = () => {
  const { token } = useAuth()
  const [websites, setWebsites] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const { data: initialWebsites, isLoading: isFetching } =
    trpc.user.getMultiPurposeWebsites.useQuery({ token: token || '' }, { enabled: !!token })

  const updateWebsitesMutation = trpc.user.updateMultiPurposeWebsites.useMutation()

  useEffect(() => {
    if (initialWebsites) {
      setWebsites(initialWebsites)
      setIsLoading(false)
    }
  }, [initialWebsites])

  const handleUpdate = (updatedWebsites: string[]) => {
    const validWebsites = updatedWebsites.map((s) => s.trim()).filter(Boolean)
    setWebsites(validWebsites)
    if (token) {
      updateWebsitesMutation.mutate({ token, websites: validWebsites })
    }
  }

  const handleWebsiteChange = (index: number, value: string) => {
    const newWebsites = [...websites]
    newWebsites[index] = value
    setWebsites(newWebsites)
  }

  const handleAddNew = () => {
    setWebsites([...websites, ''])
  }

  const handleRemove = (index: number) => {
    const newWebsites = websites.filter((_, i) => i !== index)
    handleUpdate(newWebsites)
  }

  if (isLoading || isFetching) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-1/2 bg-muted rounded animate-pulse mb-2"></div>
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-10 w-full bg-muted rounded animate-pulse"></div>
                <div className="h-10 w-10 bg-muted rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Multi-Purpose Websites</CardTitle>
        <CardDescription>
          Websites listed here will always be re-evaluated by the AI instead of using your past
          history. Add websites that you use for both work and personal tasks (e.g., YouTube,
          Reddit, Twitter).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {websites.map((website, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={website}
                onChange={(e) => handleWebsiteChange(index, e.target.value)}
                onBlur={() => handleUpdate(websites)}
                placeholder="Enter website pattern (e.g., youtube.com)"
              />
              <Button variant="ghost" size="icon" onClick={() => handleRemove(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button onClick={handleAddNew} variant="outline" className="md:col-span-2">
            Add New Website
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
