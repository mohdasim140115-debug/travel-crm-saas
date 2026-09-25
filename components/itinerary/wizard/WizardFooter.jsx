'use client'

import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function WizardFooter({
  step,
  totalSteps,
  onBack,
  onNext,
  nextLabel,
  saving,
}) {
  const progress = Math.round((step / totalSteps) * 100)

  const ContinueButton = ({ className }) => (
    <Button
      type="button"
      onClick={onNext}
      disabled={saving}
      className={cn(
        'gap-2 bg-linear-to-r from-[#3b1769] to-primary text-white shadow-sm transition-[filter,box-shadow] hover:brightness-110 hover:shadow-md',
        className
      )}
    >
      <span className="truncate">{saving ? 'Saving…' : nextLabel || 'Continue'}</span>
      {step >= totalSteps ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0" />
      )}
    </Button>
  )

  return (
    <>
      {/* Tablet/desktop — static row inside a card. */}
      <Card className="hidden border-border/60 shadow-sm sm:block">
        <CardContent className="flex flex-row items-center gap-3 p-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={step <= 1} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="flex w-40 flex-col items-center gap-1.5">
            <span className="text-xs font-medium text-accent-secondary">{progress}% complete</span>
            <Progress value={progress} className="h-2 w-full bg-accent-secondary/15 [&>div]:bg-accent-secondary" />
          </div>

          <ContinueButton />
        </CardContent>
      </Card>

      {/* Mobile — a standalone fixed toolbar (not nested inside a Card), so no
          ancestor's overflow/stacking context can clip it or steal taps. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-card after:content-[''] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.3)] sm:hidden">
        <div className="mb-2 flex items-center gap-3">
          <Progress value={progress} className="h-1.5 flex-1 bg-accent-secondary/15 [&>div]:bg-accent-secondary" />
          <span className="shrink-0 text-[11px] font-medium text-accent-secondary">
            Step {step} of {totalSteps}
          </span>
        </div>
        <div className="flex flex-row items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={step <= 1}
            className="h-12 flex-1 gap-1 rounded-xl border-primary/40 bg-primary/10 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <ContinueButton className="h-12 flex-[1.6] rounded-xl text-sm font-semibold" />
        </div>
      </div>
    </>
  )
}
