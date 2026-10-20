export const ADMIN_CARD_PAGE_SIZE = 9;

export function paginateItems(items = [], requestedPage = 1, pageSize = ADMIN_CARD_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : ADMIN_CARD_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(totalPages, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1));
  const startIndex = (page - 1) * size;

  return {
    items: list.slice(startIndex, startIndex + size),
    page,
    totalPages,
    start: list.length ? startIndex + 1 : 0,
    end: Math.min(startIndex + size, list.length),
    total: list.length,
  };
}
