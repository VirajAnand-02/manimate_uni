export default function Footer() {
  return (
    <footer className="mt-auto border-t border-ink-800 px-6 py-8 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-[13px] text-chalk-500">
          Manimate — topics into narrated mathematical lectures.
        </p>
        <div className="flex items-center gap-6 text-[13px] text-chalk-500">
          <a href="#" className="transition-colors hover:text-chalk-200">Privacy</a>
          <a href="#" className="transition-colors hover:text-chalk-200">Terms</a>
          <a href="#" className="transition-colors hover:text-chalk-200">Contact</a>
        </div>
      </div>
    </footer>
  );
}
