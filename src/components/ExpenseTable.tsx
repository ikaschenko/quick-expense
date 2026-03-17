import { useCallback, useEffect, useRef, useState } from "react";
import { EXPENSE_HEADERS } from "../constants/expenses";
import { ExpenseRecord } from "../types/expense";

const COMMENT_PREVIEW_LENGTH = 50;
const TOOLTIP_GAP = 6;
const TOOLTIP_VIEWPORT_MARGIN = 8;

interface ExpenseTableProps {
  records: ExpenseRecord[];
  emptyMessage?: string;
}

function getCommentPreview(comment: string): string {
  return comment.length > COMMENT_PREVIEW_LENGTH
    ? `${comment.slice(0, COMMENT_PREVIEW_LENGTH)}...`
    : comment;
}

interface TooltipPosition {
  top: number;
  left: number;
  maxWidth: number;
}

function computeTooltipPosition(triggerEl: HTMLElement): TooltipPosition {
  const rect = triggerEl.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;

  const left = Math.max(TOOLTIP_VIEWPORT_MARGIN, rect.left);
  const maxWidth = viewportWidth - left - TOOLTIP_VIEWPORT_MARGIN;

  return {
    top: rect.bottom + TOOLTIP_GAP,
    left,
    maxWidth: Math.max(maxWidth, 120),
  };
}

function CommentCell({ comment }: { comment: string }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      setPosition(computeTooltipPosition(triggerRef.current));
    }
  }, []);

  const open = useCallback(() => {
    updatePosition();
    setIsOpen(true);
  }, [updatePosition]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  useEffect(() => {
    if (!isOpen) return;

    const onScroll = (): void => updatePosition();
    const wrapper = triggerRef.current?.closest(".table-wrapper");
    wrapper?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      wrapper?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isOpen, updatePosition]);

  if (comment.length <= COMMENT_PREVIEW_LENGTH) {
    return <>{comment}</>;
  }

  return (
    <div
      className="comment-preview-wrapper"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <button
        ref={triggerRef}
        aria-expanded={isOpen}
        className="comment-preview-trigger"
        onBlur={close}
        onClick={toggle}
        type="button"
      >
        {getCommentPreview(comment)}
      </button>
      {isOpen && position ? (
        <div
          className="comment-tooltip"
          role="tooltip"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            maxWidth: position.maxWidth,
          }}
        >
          {comment}
        </div>
      ) : null}
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
