const SECTION_COLORS = {
  CRM: "purple",
  Company: "success",
  System: "secondary",
};

export function sectionColor(heading) {
  if (!heading) return "secondary";
  return SECTION_COLORS[heading] || "secondary";
}

export function groupMenuBySection(items) {
  const sections = [];
  let current = { heading: null, color: "secondary", items: [] };

  items.forEach((item) => {
    if (item.heading) {
      if (current.items.length) sections.push(current);
      current = {
        heading: item.heading,
        color: sectionColor(item.heading),
        items: [],
      };
    } else {
      current.items.push(item);
    }
  });

  if (current.items.length) sections.push(current);
  return sections;
}
