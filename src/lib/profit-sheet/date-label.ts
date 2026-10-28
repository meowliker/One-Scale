// Format calendar keys directly so browser timezone cannot shift the date.
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatSheetDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}
