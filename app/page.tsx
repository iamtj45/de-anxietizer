import { Composer } from "./components/Composer";

export default function Home() {
  return (
    <div className="wrap">
      <header className="topbar">
        <p className="brand">
          The De&#8209;Anxietizer <em>compose</em>
        </p>
        <p className="tagline">Say it furious. Send it composed.</p>
      </header>
      <Composer />
    </div>
  );
}
