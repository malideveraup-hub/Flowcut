import styles from './CardPagination.module.css';

export default function CardPagination({ pagination, onPageChange, itemLabel }) {
  return (
    <nav className={styles.pagination} aria-label={`${itemLabel} pagination`}>
      <span className={styles.range}>
        {pagination.total
          ? `Showing ${pagination.start}–${pagination.end} of ${pagination.total}`
          : `0 ${itemLabel}`}
      </span>
      <div className={styles.controls}>
        <button
          className={styles.button}
          type="button"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          aria-label={`Previous ${itemLabel} page`}
        >
          Previous
        </button>
        <span className={styles.page} aria-live="polite">Page {pagination.page} of {pagination.totalPages}</span>
        <button
          className={styles.button}
          type="button"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          aria-label={`Next ${itemLabel} page`}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
