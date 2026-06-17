export function CompanionScreenHeader(props: { title: string }) {
  return (
    <div className="px-1 pb-2 pt-1">
      <h1 className="text-xl font-semibold leading-7 text-foreground">{props.title}</h1>
    </div>
  );
}
