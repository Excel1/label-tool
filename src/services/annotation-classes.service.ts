import type { AnnotationClass } from 'src/interfaces/Annotation';

export function loadAnnotationClasses(raw: string): AnnotationClass[] {
  // Support both "id name" and plain "name" lines, skip comments.
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const map = new Map<number, string>();

  lines.forEach((line, index) => {
    // Accepted formats: "0 person" or "0: person" or "0 - person".
    const match = line.match(/^(\d+)\s*[,:;-]?\s+(.+)$/);

    if (match) {
      const id = Number.parseInt(match[1], 10);
      const name = match[2].trim();
      if (!map.has(id) && name.length > 0) {
        map.set(id, name);
      }
      return;
    }

    if (!map.has(index)) {
      map.set(index, line);
    }
  });

  if (map.size === 0) {
    // Ensure at least one fallback class exists.
    map.set(0, 'class-0');
  }

  return Array.from(map.entries())
    .map(([id, name]) => ({
      id,
      name,
      color: `hsl(${(12 + id * 47) % 360} 75% 52%)`,
    }))
    .sort((a, b) => a.id - b.id);
}
