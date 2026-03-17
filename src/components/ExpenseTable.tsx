import { EXPENSE_HEADERS } from "../constants/expenses";
import { ExpenseRecord } from "../types/expense";

interface ExpenseTableProps {
  records: ExpenseRecord[];
  emptyMessage?: string;
}

export function ExpenseTable({
  records,
  emptyMessage = "No records found.",
}: ExpenseTableProps): JSX.Element {
  return (
    <div className="table-wrapper">
      <table className="records-table">
        <thead>
          <tr>
            {EXPENSE_HEADERS.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={EXPENSE_HEADERS.length} className="empty-cell">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            records.map((record) => (
              <tr key={record.rowNumber}>
                {EXPENSE_HEADERS.map((header) => (
                  <td key={`${record.rowNumber}-${header}`}>{record[header]}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
