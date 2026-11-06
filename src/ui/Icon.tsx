export function Icon({
  name,
}: {
  name: "print" | "document" | "bookmark" | "timeline" | "settings";
}) {
  const paths = {
    print: (
      <>
        <path d="M7 8V3h10v5M7 17H4V9h16v8h-3" />
        <path d="M7 14h10v7H7zM17 11h.01" />
      </>
    ),
    document: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
    timeline: (
      <>
        <path d="M5 12h14" />
        <circle cx="3" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="21" cy="12" r="2" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
