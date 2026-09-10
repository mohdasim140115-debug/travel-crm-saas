'use client'

import { useEffect, useState } from 'react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Plus,
  Loader2,
  Receipt,
  Users,
  Download,
  BookText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatInr } from '@/utils/crm'
import { toCompressedDataUrl } from '@/lib/imageCompress'

function authH() {
  const token = localStorage.getItem('token')
  return { Authorization: `Bearer ${token}` }
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'misc', label: 'Misc' },
  { value: 'other', label: 'Other' },
]

export default function FinancePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [breakdownView, setBreakdownView] = useState('month')

  const [summary, setSummary] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [salaries, setSalaries] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState(null)

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ category: 'other', amount: '', remark: '', date: '' })
  const [expenseProof, setExpenseProof] = useState('')
  const [savingExpense, setSavingExpense] = useState(false)

  const [salaryOpen, setSalaryOpen] = useState(false)
  const [salaryForm, setSalaryForm] = useState({ userId: '', amount: '', month: '', remark: '', date: '' })
  const [salaryProof, setSalaryProof] = useState('')
  const [savingSalary, setSavingSalary] = useState(false)

  const [ledgerFrom, setLedgerFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [ledgerTo, setLedgerTo] = useState(now.toISOString().slice(0, 10))
  const [exportingLedger, setExportingLedger] = useState(false)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    if (!['admin', 'accounts'].includes(u.role)) {
      window.location.href = '/dashboard'
      return
    }
    fetch('/api/team/members', { headers: authH() })
      .then((r) => r.json())
      .then((d) => setEmployees(d.members || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch(`/api/finance/summary?year=${year}&month=${month}`, { headers: authH() }).then((r) => r.json()),
      fetch(`/api/finance/expenses?year=${year}&month=${month}`, { headers: authH() }).then((r) => r.json()),
      fetch(`/api/finance/salaries?year=${year}&month=${month}`, { headers: authH() }).then((r) => r.json()),
    ])
      .then(([summaryData, expenseData, salaryData]) => {
        if (summaryData?.profit) setSummary(summaryData)
        else toast.error(summaryData?.error || 'Failed to load finance summary')
        setExpenses(expenseData.expenses || [])
        setSalaries(salaryData.salaries || [])
      })
      .catch(() => toast.error('Failed to load finance data'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  const openExpenseDialog = () => {
    setExpenseForm({ category: 'other', amount: '', remark: '', date: new Date().toISOString().slice(0, 10) })
    setExpenseProof('')
    setExpenseOpen(true)
  }

  const pickExpenseProof = async (file) => {
    if (!file) return
    const dataUrl = await toCompressedDataUrl(file, 70 * 1024)
    setExpenseProof(dataUrl)
  }

  const saveExpense = async () => {
    const amount = Number(expenseForm.amount)
    if (!(amount > 0)) {
      toast.error('Enter a valid amount')
      return
    }
    setSavingExpense(true)
    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ ...expenseForm, amount, proofUrl: expenseProof || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save expense')
      toast.success('Expense added')
      setExpenseOpen(false)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingExpense(false)
    }
  }

  const openSalaryDialog = () => {
    setSalaryForm({
      userId: '',
      amount: '',
      month: `${year}-${String(month).padStart(2, '0')}`,
      remark: '',
      date: new Date().toISOString().slice(0, 10),
    })
    setSalaryProof('')
    setSalaryOpen(true)
  }

  const pickSalaryProof = async (file) => {
    if (!file) return
    const dataUrl = await toCompressedDataUrl(file, 70 * 1024)
    setSalaryProof(dataUrl)
  }

  const saveSalary = async () => {
    const amount = Number(salaryForm.amount)
    if (!salaryForm.userId) {
      toast.error('Select an employee')
      return
    }
    if (!(amount > 0)) {
      toast.error('Enter a valid amount')
      return
    }
    if (!salaryForm.month) {
      toast.error('Select which month this salary is for')
      return
    }
    setSavingSalary(true)
    try {
      const res = await fetch('/api/finance/salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ ...salaryForm, amount, proofUrl: salaryProof || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save salary payment')
      toast.success('Salary payment recorded')
      setSalaryOpen(false)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingSalary(false)
    }
  }

  const exportLedger = async () => {
    if (!ledgerFrom || !ledgerTo) {
      toast.error('Select a from and to date')
      return
    }
    setExportingLedger(true)
    try {
      const res = await fetch(`/api/finance/ledger?from=${ledgerFrom}&to=${ledgerTo}&export=csv`, {
        headers: authH(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to export ledger')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-ledger-${ledgerFrom}-to-${ledgerTo}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setExportingLedger(false)
    }
  }

  const netProfit = summary ? summary.profit.current - summary.expenses.total : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Revenue, profit, and company expenses — the full financial picture.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-[100px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || !summary ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* Summary cards — all-time, not tied to the selected period */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <Card
              className="shadow-sm"
              style={{
                background:
                  'radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.35) 0%, rgba(245, 158, 11, 0.14) 18%, transparent 55%), var(--card)',
                borderColor: 'rgba(245, 158, 11, 0.4)',
              }}
            >
              <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5 text-amber-600" /> Amount received in account
                </div>
                <p className="mt-1 text-xl font-semibold text-amber-600">
                  {formatInr(summary.revenueReceivedAllTime)}
                </p>
                {summary.uninvoicedAdvances.total > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    + {formatInr(summary.uninvoicedAdvances.total)} collected but not yet invoiced
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-success" /> Current profit
                </div>
                <p className="mt-1 text-xl font-semibold text-success">
                  {formatInr(summary.profit.current)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Realized — client fully paid</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-amber-600" /> Upcoming profit
                </div>
                <p className="mt-1 text-xl font-semibold text-amber-600">
                  {formatInr(summary.profit.upcoming)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Projected — balance still due</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Company expenses
                </div>
                <p className="mt-1 text-xl font-semibold text-destructive">
                  {formatInr(summary.expenses.total)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Salaries {formatInr(summary.expenses.salary)} · Overheads {formatInr(summary.expenses.overhead)}
                  {summary.expenses.refunds > 0 && ` · Refunds ${formatInr(summary.expenses.refunds)}`}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IndianRupee className="h-3.5 w-3.5" /> Net profit
                </div>
                <p className={`mt-1 text-xl font-semibold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatInr(netProfit)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Current profit minus company expenses</p>
              </CardContent>
            </Card>
          </div>

          {summary.uninvoicedAdvances.items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Collected but not yet invoiced, by client</p>
              {summary.uninvoicedAdvances.items.map((item) => (
                <div key={item.bookingId} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <span className="text-muted-foreground">{item.clientName}</span>
                  <span className="font-medium">{formatInr(item.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Profit & expenses ledger export */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookText className="h-4 w-4" /> Profit & expenses ledger
              </CardTitle>
              <CardDescription>
                Every income collection and expense in a date range, as a single log — export to Excel/CSV.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 space-y-1.5 sm:flex-none">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 sm:flex-none">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} />
                </div>
                <Button className="w-full gap-1.5 sm:w-auto" disabled={exportingLedger} onClick={exportLedger}>
                  {exportingLedger ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export to Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Income vs expense breakdown */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" /> Income vs expense
                </CardTitle>
                <CardDescription>
                  {breakdownView === 'month' ? `Day-wise for ${monthLabel}` : `Month-wise for ${year}`}
                </CardDescription>
              </div>
              <Tabs value={breakdownView} onValueChange={setBreakdownView}>
                <TabsList>
                  <TabsTrigger value="month">Month</TabsTrigger>
                  <TabsTrigger value="year">Year</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {breakdownView === 'month' ? (
                <div className="max-h-96 space-y-1 overflow-y-auto">
                  {summary.period.days.filter((d) => d.income || d.expense).length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No income or expenses recorded for {monthLabel}.
                    </p>
                  ) : (
                    summary.period.days
                      .filter((d) => d.income || d.expense)
                      .map((d) => (
                        <div key={d.date} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                          <span className="text-muted-foreground">{formatDate(d.date)}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-success">+{formatInr(d.income)}</span>
                            <span className="text-destructive">-{formatInr(d.expense)}</span>
                            <span className={`font-semibold ${d.net >= 0 ? '' : 'text-destructive'}`}>
                              {formatInr(d.net)}
                            </span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {summary.period.months.map((m) => (
                    <button
                      key={m.month}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/50"
                      onClick={() => {
                        setMonth(m.month)
                        setBreakdownView('month')
                      }}
                    >
                      <span className="text-muted-foreground">{MONTH_NAMES[m.month - 1]}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-success">+{formatInr(m.income)}</span>
                        <span className="text-destructive">-{formatInr(m.expense)}</span>
                        <span className={`font-semibold ${m.net >= 0 ? '' : 'text-destructive'}`}>
                          {formatInr(m.net)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Company expenses */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" /> Company expenses
                </CardTitle>
                <CardDescription>Rent, utilities, marketing, misc — {monthLabel}</CardDescription>
              </div>
              <Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={openExpenseDialog}>
                <Plus className="h-3.5 w-3.5" /> Add expense
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {expenses.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No expenses logged for {monthLabel}.</p>
              ) : (
                expenses.map((e) => (
                  <div key={e._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                    <div>
                      <span className="font-medium capitalize">{e.category}</span>
                      {e.remark && <span className="text-muted-foreground"> · {e.remark}</span>}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(e.date)} {e.createdBy?.name ? `· ${e.createdBy.name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-destructive">{formatInr(e.amount)}</span>
                      {e.proofUrl && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setPreviewImage(e.proofUrl)}
                        >
                          View proof
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Employee salaries */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" /> Employee salaries
                </CardTitle>
                <CardDescription>Salary payouts — {monthLabel}</CardDescription>
              </div>
              <Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={openSalaryDialog}>
                <Plus className="h-3.5 w-3.5" /> Pay salary
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {salaries.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No salary payments for {monthLabel}.</p>
              ) : (
                salaries.map((s) => (
                  <div key={s._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                    <div>
                      <span className="font-medium">{s.employeeName}</span>
                      {s.employeeRole && (
                        <Badge variant="outline" className="ml-1.5 text-xs capitalize">
                          {s.employeeRole}
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Salary for {s.month} · Paid {formatDate(s.date)}
                        {s.remark ? ` · ${s.remark}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-destructive">{formatInr(s.amount)}</span>
                      {s.proofUrl && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setPreviewImage(s.proofUrl)}
                        >
                          View proof
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add expense dialog */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add company expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Remark</Label>
              <Input
                value={expenseForm.remark}
                onChange={(e) => setExpenseForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="e.g. August office rent"
              />
            </div>
            <div className="space-y-2">
              <Label>Proof (optional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => pickExpenseProof(e.target.files?.[0])} />
              {expenseProof && <img src={expenseProof} alt="Proof" className="mt-1 h-20 rounded border object-cover" />}
            </div>
          </div>
          <Button className="w-full gap-1.5" disabled={savingExpense} onClick={saveExpense}>
            {savingExpense && <Loader2 className="h-4 w-4 animate-spin" />}
            Save expense
          </Button>
        </DialogContent>
      </Dialog>

      {/* Pay salary dialog */}
      <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record salary payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select
                value={salaryForm.userId || 'unassigned'}
                onValueChange={(v) =>
                  setSalaryForm((f) => ({ ...f, userId: v === 'unassigned' ? '' : v }))
                }
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Select employee</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp._id} value={emp._id}>
                      {emp.name} ({emp.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={salaryForm.amount}
                onChange={(e) => setSalaryForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Salary for month *</Label>
              <Input
                type="month"
                value={salaryForm.month}
                onChange={(e) => setSalaryForm((f) => ({ ...f, month: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment date *</Label>
              <Input
                type="date"
                value={salaryForm.date}
                onChange={(e) => setSalaryForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Remark</Label>
              <Input
                value={salaryForm.remark}
                onChange={(e) => setSalaryForm((f) => ({ ...f, remark: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Proof (optional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => pickSalaryProof(e.target.files?.[0])} />
              {salaryProof && <img src={salaryProof} alt="Proof" className="mt-1 h-20 rounded border object-cover" />}
            </div>
          </div>
          <Button className="w-full gap-1.5" disabled={savingSalary} onClick={saveSalary}>
            {savingSalary && <Loader2 className="h-4 w-4 animate-spin" />}
            Save payment
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Proof</DialogTitle>
          </DialogHeader>
          {previewImage && <img src={previewImage} alt="Proof" className="w-full rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
