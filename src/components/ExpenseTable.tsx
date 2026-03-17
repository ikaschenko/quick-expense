import { useState } from "react";
import { EXPENSE_HEADERS } from "../constants/expenses";
import { ExpenseRecord } from "../types/expense";

const COMMENT_PREVIEW_LENGTH = 50;

interface ExpenseTableProps {
  records: ExpenseRecord[];
  emptyMessage?: string;
}

function getCommentPreview(comment: string): string {
  return comment.length > COMMENT_PREVIEW_LENGTH
    ? `${comment.slice(0, COMMENT_PREVIEW_LENGTH)}...`
    : comment;
}

function CommentCell({ comment }: { comment: string }): JSX.Element {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  if (comment.length <= COMMENT_PREVIEW_LENGTH) {
    return <>{comment}</>;
  }

  return (
    <div
      className="comment-preview-wrapper"
      data-open={isTooltipOpen ? "true" : "false"}
    >
      <button
        aria-expanded={isTooltipOpen}
        className="comment-preview-trigger"
        onBlur={() => setIsTooltipOpen(false)}
        onClick={() => setIsTooltipOpen((current) => !current)}
        type="button"
      >
        {getCommentPreview(comment)}
      </button>
      <div className="comment-tooltip" role="tooltip">
        {comment}
      </div>
    </div>
  );
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
                  <td key={`${record.rowNumber}-${header}`}>
                    {header === "Comment" ? (
                      <CommentCell comment={record.Comment} />
                    ) : (
                      record[header]
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
