package com.splitwise;

import java.util.*;

/**
 * SplitWise AI - Java Debt Simplification Engine
 * Uses a greedy cash-flow minimization algorithm to reduce N group debts down to the minimal number of transfers.
 * Complexity: O(V log V)
 */
public class DebtSimplifier {

    public static class Transaction {
        public String from;
        public String to;
        public double amount;

        public Transaction(String from, String to, double amount) {
            this.from = from;
            this.to = to;
            this.amount = amount;
        }

        @Override
        public String toString() {
            return String.format("%s pays %s: ₹%.2f", from, to, amount);
        }
    }

    public static class ParticipantBalance {
        public String name;
        public double netAmount; // positive means owed money, negative means owes money

        public ParticipantBalance(String name, double netAmount) {
            this.name = name;
            this.netAmount = netAmount;
        }
    }

    /**
     * Minimizes debt transactions among a group of participants.
     * @param initialDebts List of raw debts [Debtor -> Creditor -> Amount]
     * @return Minimal list of optimized settlement transactions
     */
    public static List<Transaction> simplifyDebts(List<Transaction> initialDebts) {
        // Step 1: Calculate Net Balance for each person
        Map<String, Double> balances = new HashMap<>();
        for (Transaction t : initialDebts) {
            balances.put(t.from, balances.getOrDefault(t.from, 0.0) - t.amount);
            balances.put(t.to, balances.getOrDefault(t.to, 0.0) + t.amount);
        }

        // Priority queues for debtors (owes money, negative) and creditors (owed money, positive)
        PriorityQueue<ParticipantBalance> debtors = new PriorityQueue<>(
            (a, b) -> Double.compare(a.netAmount, b.netAmount) // Ascending (most negative first)
        );
        PriorityQueue<ParticipantBalance> creditors = new PriorityQueue<>(
            (a, b) -> Double.compare(b.netAmount, a.netAmount) // Descending (largest positive first)
        );

        for (Map.Entry<String, Double> entry : balances.entrySet()) {
            double bal = Math.round(entry.getValue() * 100.0) / 100.0;
            if (bal < -0.01) {
                debtors.offer(new ParticipantBalance(entry.getKey(), bal));
            } else if (bal > 0.01) {
                creditors.offer(new ParticipantBalance(entry.getKey(), bal));
            }
        }

        List<Transaction> optimizedTransactions = new ArrayList<>();

        // Step 2: Greedily match maximum debtor with maximum creditor
        while (!debtors.isEmpty() && !creditors.isEmpty()) {
            ParticipantBalance debtor = debtors.poll();
            ParticipantBalance creditor = creditors.poll();

            double debtToSettle = Math.min(-debtor.netAmount, creditor.netAmount);
            debtToSettle = Math.round(debtToSettle * 100.0) / 100.0;

            optimizedTransactions.add(new Transaction(debtor.name, creditor.name, debtToSettle));

            debtor.netAmount += debtToSettle;
            creditor.netAmount -= debtToSettle;

            if (debtor.netAmount < -0.01) {
                debtors.offer(debtor);
            }
            if (creditor.netAmount > 0.01) {
                creditors.offer(creditor);
            }
        }

        return optimizedTransactions;
    }

    public static void main(String[] args) {
        System.out.println("==================================================");
        System.out.println(" SplitWise AI - Java Debt Simplification Engine ");
        System.out.println("==================================================");

        List<Transaction> initialDebts = Arrays.asList(
            new Transaction("Alice", "Bob", 600),
            new Transaction("Bob", "Charlie", 400),
            new Transaction("David", "Alice", 700),
            new Transaction("Charlie", "David", 300),
            new Transaction("Emma", "Bob", 500)
        );

        System.out.println("\n--- Raw Transactions (" + initialDebts.size() + " transfers) ---");
        for (Transaction t : initialDebts) {
            System.out.println("  " + t);
        }

        List<Transaction> simplified = simplifyDebts(initialDebts);

        System.out.println("\n--- Optimized Transactions (" + simplified.size() + " transfers) ---");
        for (Transaction t : simplified) {
            System.out.println("  ✓ " + t);
        }
        System.out.println("\nDebt simplification completed successfully.");
    }
}
