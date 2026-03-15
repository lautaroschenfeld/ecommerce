import Link from "next/link"

import styles from "./runtime-state.module.css"

export default function NotFound() {
  return (
    <div className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.kicker}>404</p>
        <h1 className={styles.title}>No encontramos esta pagina.</h1>
        <p className={styles.description}>
          Puede que el enlace haya cambiado o que el contenido ya no este disponible.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.button} data-variant="primary">
            Ir al inicio
          </Link>
          <Link href="/productos" className={styles.button}>
            Ver productos
          </Link>
        </div>
      </section>
    </div>
  )
}
