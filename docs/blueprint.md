# Expense Splitter — Bot specification

**Archetype:** custom

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that splits shared trip expenses among friends inside group chats. Users create trips, log who paid for what, and the bot tracks who owes whom, simplifies the debt to the fewest payments, and lets people mark debts as paid. Everything stays private to trip members.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Groups of friends
- Colleagues on business trips

## Success criteria

- Users can create a trip, log expenses, and see simplified debt in the group chat
- Users can mark debts as paid after settling IRL
- Users can leave a trip or see their balance privately
- Organizers can see full trip summaries

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **/create** (command, actor: user, command: /create) — Create a new trip with a name and optional currency
  - inputs: name
  - outputs: trip created confirmation, currency confirmation
- **/add** (command, actor: user, command: /add) — Add members to the trip
  - inputs: user
  - outputs: member added confirmation
- **/log** (command, actor: user, command: /log) — Log an expense with amount, description, payer, and beneficiaries
  - inputs: amount, description, payer, beneficiaries
  - outputs: expense logged confirmation, updated balance summary
- **/balance** (command, actor: user, command: /balance) — Show who owes whom, simplified to the fewest payments
  - outputs: simplified debt summary
- **/settle** (command, actor: user, command: /settle) — Mark a debt as paid after settling it IRL
  - inputs: debtor, creditor, amount
  - outputs: settlement confirmation, updated balance summary
- **/overview** (command, actor: user, command: /overview) — Organizer-only: full trip summary with all expenses
  - outputs: full trip summary
- **/leave** (command, actor: user, command: /leave) — Remove oneself from the trip
  - outputs: leave confirmation
- **My balance** (button, actor: user, callback: balance:my) — Check your private balance in a DM
  - outputs: private balance summary
- **Settle debt** (button, actor: user, callback: settle:confirm) — Confirm settling a debt after IRL payment
  - inputs: debtor, creditor, amount
  - outputs: settlement confirmation, updated balance summary
- **Leave trip** (button, actor: user, callback: leave:confirm) — Confirm leaving the trip
  - outputs: leave confirmation

## Flows

### Create trip
_Trigger:_ /create

1. User enters /create <name>
2. Bot asks for currency (defaults to USD)
3. User confirms or specifies currency
4. Bot creates trip and adds user as organizer
5. Bot confirms trip creation in group chat

_Data touched:_ Trip, Member

### Add member
_Trigger:_ /add

1. User enters /add <user>
2. Bot checks if user is already in trip
3. Bot adds user to trip
4. Bot confirms addition in group chat

_Data touched:_ Member

### Log expense
_Trigger:_ /log

1. User enters /log <amount> <description> <payer> <beneficiaries>
2. Bot parses input and validates
3. Bot splits expense among beneficiaries (even split by default)
4. Bot updates balances
5. Bot confirms expense in group chat with updated balance summary

_Data touched:_ Expense, Member, Debt

### Check balance
_Trigger:_ /balance

1. User enters /balance
2. Bot calculates simplified debt using minimum-transaction algorithm
3. Bot shows who owes whom in group chat

_Data touched:_ Debt

### Settle debt
_Trigger:_ /settle

1. User enters /settle <debtor> <creditor> <amount>
2. Bot asks for confirmation
3. User confirms
4. Bot marks debt as paid
5. Bot updates balances
6. Bot confirms settlement in group chat

_Data touched:_ Debt, Member

### View overview
_Trigger:_ /overview

1. Organizer enters /overview
2. Bot shows full trip summary with all expenses
3. Bot shows total spent, member balances, and simplified debt

_Data touched:_ Trip, Expense, Member, Debt

### Leave trip
_Trigger:_ /leave

1. User enters /leave
2. Bot asks for confirmation
3. User confirms
4. Bot removes user from trip
5. Bot confirms departure in group chat

_Data touched:_ Member

### Check private balance
_Trigger:_ button:My balance

1. User clicks My balance button
2. Bot opens DM with user
3. Bot shows user's private balance summary

_Data touched:_ Member

### Confirm settlement
_Trigger:_ button:Settle debt

1. User clicks Settle debt button
2. Bot shows debt details and asks for confirmation
3. User confirms
4. Bot marks debt as paid
5. Bot updates balances
6. Bot confirms settlement in group chat

_Data touched:_ Debt, Member

### Confirm leave
_Trigger:_ button:Leave trip

1. User clicks Leave trip button
2. Bot shows trip details and asks for confirmation
3. User confirms
4. Bot removes user from trip
5. Bot confirms departure in group chat

_Data touched:_ Member

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Trip** _(retention: persistent)_ — A shared expense pool with a name, currency, and list of members
  - fields: id, name, currency, organizer_id, created_at
- **Expense** _(retention: persistent)_ — A logged cost with who paid, how much, what it was for, and the people who benefit
  - fields: id, trip_id, amount, description, payer_id, beneficiaries, created_at
- **Debt** _(retention: persistent)_ — Who owes whom after splitting; simplified to the fewest payments needed
  - fields: id, trip_id, debtor_id, creditor_id, amount, settled
- **Member** _(retention: persistent)_ — A participant in a trip, with their balance and share preferences
  - fields: id, trip_id, user_id, balance, created_at

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Create a new trip
- Add members to a trip
- Log expenses
- View full trip summary
- Settle debts
- Leave a trip

## Notifications

- Expense logged in group chat
- Balance update in group chat
- Settlement confirmation in group chat
- Leave confirmation in group chat
- Private balance summary in DM

## Permissions & privacy

- Trip data visible only to members
- Expense details visible only to members
- Debt details visible only to members
- Member balances visible only to members
- Organizer-only overview
- Private balance checks in DM

## Edge cases

- User tries to add themselves to a trip
- User tries to log an expense with invalid beneficiaries
- User tries to settle a debt that doesn't exist
- User tries to settle a debt with incorrect amount
- User tries to view an overview of a trip they're not in
- User tries to leave a trip they're not in
- User tries to create a trip with an empty name
- User tries to log an expense with negative amount
- User tries to log an expense with zero amount
- User tries to settle a debt with zero amount

## Required tests

- Create a trip with default currency
- Create a trip with custom currency
- Add a member to a trip
- Log an expense with even split
- Log an expense with custom beneficiaries
- Check balance and verify simplified debt
- Settle a debt and verify balance update
- View full trip summary as organizer
- Leave a trip and verify removal
- Check private balance in DM
- Confirm settlement before clearing debt
- Confirm leave before removing user
- Error handling for invalid inputs
- Privacy checks for non-members

## Assumptions

- Currency defaults to USD if not specified
- Expense splitting defaults to even split if beneficiaries are not specified
- Debt simplification uses minimum-transaction algorithm
- Trip data is visible only to members
- Confirmation is always required before settling a debt
- No currency conversion is handled by the bot
- No receipt scanning or photo uploads are supported
- No automatic payment processing is handled by the bot
- No multi-currency trips are supported
