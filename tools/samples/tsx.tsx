import React, { useState } from "react";

type Props = { items: string[]; onPick?: (item: string) => void };

export function List({ items, onPick }: Props) {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <div className="list" data-open={open}>
      {/* a comment */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ color: "red", padding: 4 }}
      >
        {open ? "Close" : `Open (${items.length})`}
      </button>
      {open && items.map((item) => <Item key={item} label={item} onClick={() => onPick?.(item)} />)}
      <>
        <p>
          Text with &amp; entity and {items[0]} expression
        </p>
      </>
    </div>
  );
}

const Item = ({ label, ...rest }: { label: string } & React.HTMLAttributes<HTMLLIElement>) => <li {...rest}>{label}</li>;
