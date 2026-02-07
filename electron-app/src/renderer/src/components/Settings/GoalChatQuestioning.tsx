import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, CheckCircle2, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { trpc } from '../../utils/trpc'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../hooks/use-toast'

interface Message {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
}

interface GoalChatQuestioningProps {
  initialGoal?: string
  onSave: (refinedGoal: string) => void
  onCancel: () => void
  isSaving?: boolean
}

export function GoalChatQuestioning({
  initialGoal = '',
  onSave,
  onCancel,
  isSaving = false
}: GoalChatQuestioningProps) {
  const { token } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [currentGoal, setCurrentGoal] = useState(initialGoal)
  const [confidence, setConfidence] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [refinedGoal, setRefinedGoal] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const analyzeGoalMutation = trpc.user.analyzeGoal.useMutation()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (initialGoal && messages.length === 0) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: initialGoal,
        timestamp: new Date()
      }
      setMessages([userMessage])
      handleAnalyzeGoal(initialGoal, [])
    }
  }, [initialGoal])

  const handleAnalyzeGoal = async (
    goalText: string,
    conversationHistory: Array<{ role: 'user' | 'ai'; content: string }>
  ) => {
    if (!token) return

    setIsAnalyzing(true)

    try {
      const result = await analyzeGoalMutation.mutateAsync({
        token,
        currentGoal: goalText,
        conversationHistory
      })

      setConfidence(result.confidence)

      if (result.confidence >= 80 && result.refinedGoal) {
        setRefinedGoal(result.refinedGoal)
        setIsComplete(true)

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: `Perfect! I now have a clear understanding of your goals.\n\n**Refined Goal:**\n${result.refinedGoal}`,
          timestamp: new Date()
        }
        setMessages((prev) => [...prev, aiMessage])
      } else if (result.question) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: result.question,
          timestamp: new Date()
        }
        setMessages((prev) => [...prev, aiMessage])
      }
    } catch (error) {
      console.error('Error analyzing goal:', error)
      toast({
        title: 'Analysis Error',
        description: 'Failed to analyze your goal. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAnalyzing) return

    const userContent = inputValue.trim()
    setInputValue('')

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMessage])

    const conversationHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

    const updatedGoal = `${currentGoal}\n${userContent}`
    setCurrentGoal(updatedGoal)

    await handleAnalyzeGoal(updatedGoal, conversationHistory)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSave = () => {
    if (refinedGoal) {
      onSave(refinedGoal)
    }
  }

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 50) return 'bg-amber-500'
    return 'bg-rose-500'
  }

  const getConfidenceLabel = (score: number) => {
    if (score >= 80) return 'Goal Understood!'
    if (score >= 50) return 'Getting Clearer...'
    return 'Learning About Your Goals...'
  }

  return (
    <div className="flex flex-col h-[600px] bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Goal Clarification</h3>
            <p className="text-sm text-muted-foreground">AI-powered goal refinement</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {getConfidenceLabel(confidence)}
            </span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${getConfidenceColor(confidence)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${confidence}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <span className="text-sm font-semibold w-12 text-right">{confidence}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                <Bot className="w-8 h-8 text-violet-500" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">Tell me about your goals</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Start by describing what you're working on. I'll ask clarifying questions to
                  better understand your objectives.
                </p>
              </div>
            </motion.div>
          )}

          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content.split('**').map((part, i) =>
                    i % 2 === 1 ? (
                      <span key={i} className="font-semibold">
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  )}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </motion.div>
          ))}

          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex gap-3"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-sm text-muted-foreground">Analyzing your response...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border bg-muted/30 px-6 py-4">
        {isComplete ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Goal Refined!</p>
                <p className="text-sm text-muted-foreground">AI has clarified your objectives</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save Goal
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="flex gap-3">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              className="flex-1 min-h-[80px] resize-none bg-background"
              disabled={isAnalyzing}
            />
            <div className="flex flex-col justify-end">
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isAnalyzing}
                className="h-10 w-10 p-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 shadow-lg shadow-violet-500/25"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
