/** A freshly made PIN, shown exactly once, in big tabular digits. */
export function PinOnthulling({ pin, voor }: { pin: string; voor: string }) {
  const leesbaar = `${pin.slice(0, 3)} ${pin.slice(3)}`;
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-[18px] border-[3px] border-studio bg-papier px-4 py-3 text-studio">
      <p className="m-0 text-label font-bold">PIN voor {voor}</p>
      <p className="m-0 font-display text-[40px] leading-none cijfers">{leesbaar}</p>
      <p className="m-0 text-label leading-[1.4]">Geef hem door en schrijf hem op. Je ziet hem maar één keer.</p>
    </div>
  );
}
