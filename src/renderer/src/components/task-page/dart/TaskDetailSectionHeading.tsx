export function SectionHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}
