// Persistent data store for the expense splitter bot.
// In production this would use Redis (via ioredis). For dev/test, an in-memory
// store keyed identically to how Redis keys would be structured. The toolkit's
// session storage handles ephemeral conversation state; this handles DURABLE
// domain data (trips, expenses, debts, members).

export interface Trip {
  id: string;
  name: string;
  currency: string;
  organizerId: number;
  createdAt: number;
}

export interface Expense {
  id: string;
  tripId: string;
  amount: number;
  description: string;
  payerId: number;
  beneficiaries: number[];
  createdAt: number;
}

export interface Debt {
  id: string;
  tripId: string;
  debtorId: number;
  creditorId: number;
  amount: number;
  settled: boolean;
}

export interface Member {
  id: string;
  tripId: string;
  userId: number;
  createdAt: number;
}

class Store {
  private trips = new Map<string, Trip>();
  private expenses = new Map<string, Expense>();
  private debts = new Map<string, Debt>();
  private members = new Map<string, Member>();
  private userTrips = new Map<number, Set<string>>();
  private tripMembers = new Map<string, Set<number>>();
  private tripExpenses = new Map<string, Set<string>>();
  private tripDebts = new Map<string, Set<string>>();
  private nextTripId = 1;
  private nextExpenseId = 1;
  private nextDebtId = 1;
  private nextMemberId = 1;

  createTrip(name: string, currency: string, organizerId: number): Trip {
    const id = `trip_${this.nextTripId++}`;
    const trip: Trip = { id, name, currency, organizerId, createdAt: Date.now() };
    this.trips.set(id, trip);

    if (!this.userTrips.has(organizerId)) this.userTrips.set(organizerId, new Set());
    this.userTrips.get(organizerId)!.add(id);

    this.addMember(id, organizerId);
    return trip;
  }

  getTrip(id: string): Trip | undefined {
    return this.trips.get(id);
  }

  getUserTrips(userId: number): Trip[] {
    const ids = this.userTrips.get(userId);
    if (!ids) return [];
    return [...ids].map((id) => this.trips.get(id)!).filter(Boolean);
  }

  addMember(tripId: string, userId: number): Member | null {
    const trip = this.trips.get(tripId);
    if (!trip) return null;
    if (this.isMember(tripId, userId)) {
      return this.getMemberByUser(tripId, userId) ?? null;
    }
    const id = `mem_${this.nextMemberId++}`;
    const member: Member = { id, tripId, userId, createdAt: Date.now() };
    this.members.set(id, member);

    if (!this.tripMembers.has(tripId)) this.tripMembers.set(tripId, new Set());
    this.tripMembers.get(tripId)!.add(userId);

    if (!this.userTrips.has(userId)) this.userTrips.set(userId, new Set());
    this.userTrips.get(userId)!.add(tripId);

    return member;
  }

  isMember(tripId: string, userId: number): boolean {
    return this.tripMembers.get(tripId)?.has(userId) ?? false;
  }

  getTripMembers(tripId: string): Member[] {
    const userIds = this.tripMembers.get(tripId);
    if (!userIds) return [];
    const tripId_set = this.tripMembers.get(tripId)!;
    const result: Member[] = [];
    for (const m of this.members.values()) {
      if (m.tripId === tripId && tripId_set.has(m.userId)) result.push(m);
    }
    return result;
  }

  getMemberByUser(tripId: string, userId: number): Member | undefined {
    for (const m of this.members.values()) {
      if (m.tripId === tripId && m.userId === userId) return m;
    }
    return undefined;
  }

  removeMember(tripId: string, userId: number): boolean {
    const tripMembers = this.tripMembers.get(tripId);
    if (!tripMembers?.has(userId)) return false;
    tripMembers.delete(userId);
    this.userTrips.get(userId)?.delete(tripId);

    for (const [id, m] of this.members) {
      if (m.tripId === tripId && m.userId === userId) {
        this.members.delete(id);
        break;
      }
    }
    return true;
  }

  addExpense(
    tripId: string,
    amount: number,
    description: string,
    payerId: number,
    beneficiaries: number[],
  ): Expense {
    const id = `exp_${this.nextExpenseId++}`;
    const expense: Expense = { id, tripId, amount, description, payerId, beneficiaries, createdAt: Date.now() };
    this.expenses.set(id, expense);

    if (!this.tripExpenses.has(tripId)) this.tripExpenses.set(tripId, new Set());
    this.tripExpenses.get(tripId)!.add(id);
    return expense;
  }

  getTripExpenses(tripId: string): Expense[] {
    const ids = this.tripExpenses.get(tripId);
    if (!ids) return [];
    return [...ids].map((id) => this.expenses.get(id)!).filter(Boolean);
  }

  addDebt(tripId: string, debtorId: number, creditorId: number, amount: number): Debt {
    const existing = this.findDebt(tripId, debtorId, creditorId);
    if (existing) {
      existing.amount += amount;
      return existing;
    }
    const id = `debt_${this.nextDebtId++}`;
    const debt: Debt = { id, tripId, debtorId, creditorId, amount, settled: false };
    this.debts.set(id, debt);

    if (!this.tripDebts.has(tripId)) this.tripDebts.set(tripId, new Set());
    this.tripDebts.get(tripId)!.add(id);
    return debt;
  }

  findDebt(tripId: string, debtorId: number, creditorId: number): Debt | undefined {
    for (const d of this.debts.values()) {
      if (d.tripId === tripId && d.debtorId === debtorId && d.creditorId === creditorId && !d.settled) {
        return d;
      }
    }
    return undefined;
  }

  getTripDebts(tripId: string): Debt[] {
    const ids = this.tripDebts.get(tripId);
    if (!ids) return [];
    return [...ids].map((id) => this.debts.get(id)!).filter((d) => d && !d.settled);
  }

  settleDebt(debtId: string): boolean {
    const debt = this.debts.get(debtId);
    if (!debt) return false;
    debt.settled = true;
    return true;
  }

  settleDebtByParties(tripId: string, debtorId: number, creditorId: number, amount: number): boolean {
    const debt = this.findDebt(tripId, debtorId, creditorId);
    if (!debt || debt.amount < amount) return false;
    if (debt.amount === amount) {
      debt.settled = true;
    } else {
      debt.amount -= amount;
    }
    return true;
  }

  clear(): void {
    this.trips.clear();
    this.expenses.clear();
    this.debts.clear();
    this.members.clear();
    this.userTrips.clear();
    this.tripMembers.clear();
    this.tripExpenses.clear();
    this.tripDebts.clear();
    this.nextTripId = 1;
    this.nextExpenseId = 1;
    this.nextDebtId = 1;
    this.nextMemberId = 1;
  }
}

export const store = new Store();
