/** Full task board (filters, assignment, status changes) ships in Slice 3. */
export default function TasksPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-foreground">Tasks</h1>
      <p className="text-sm text-muted-foreground">Task management ships in the next build slice.</p>
    </div>
  );
}
