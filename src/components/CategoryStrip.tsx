import type { KeyboardEvent } from "react";

type CategoryStripItem = {
  id: string;
  label: string;
  imageUrl: string;
};

type CategoryStripProps = {
  items: CategoryStripItem[];
  onPick?: (id: string) => void;
};

function shapeClass(index: number, total: number): string {
  if (index === 0) return "category-strip__piece--left";
  if (index === total - 1) return "category-strip__piece--right";
  return "category-strip__piece--middle";
}

export default function CategoryStrip({ items, onPick }: CategoryStripProps) {
  return (
    <div className="category-strip" aria-label="카테고리 선택 스트립">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="button"
          tabIndex={0}
          className={`category-strip__piece ${shapeClass(index, items.length)}`}
          style={{ backgroundImage: `url(${item.imageUrl})` }}
          onClick={() => onPick?.(item.id)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onPick?.(item.id);
          }}
          aria-label={`${item.label} 카테고리 선택`}
          title={item.label}
        >
          <span className="category-strip__piece-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
