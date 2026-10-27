export type TransactionType = "income" | "expense";

export interface CurrentUser {
  id: string;
  email: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  amount: number;
  type: TransactionType;
  note: string | null;
  date: string;
  createdAt: string;
}

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  note: string | null;
  date: string;
}

export interface TransactionPage {
  items: Transaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  month: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  percentage: number;
}

export interface MonthlyStats {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  categoryBreakdown: Array<{
    categoryId: string | null;
    name: string;
    color: string;
    amount: number;
  }>;
  recentTransactions: Transaction[];
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
