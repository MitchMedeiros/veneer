export const App = ({ user }) => (
  <main className="app" {...props}>
    <Header title={`Hi ${user.name}`} />
    {user.admin ? <Admin /> : <Guest />}
    <input type="text" value={user.name} onChange={(e) => update(e.target.value)} disabled />
    <p>
      Some <b>bold</b> text &nbsp; and more
    </p>
  </main>
);
