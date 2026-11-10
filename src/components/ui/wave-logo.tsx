import Image from "next/image";

export interface WaveLogoProps {
  /** Taille du logo en pixels (carré). */
  size?: number;
  /** Classes Tailwind additionnelles (taille, marges, opacité…). */
  className?: string;
  /** Texte alternatif. Mettre "" si l'icône est purement décorative. */
  alt?: string;
  /** Préchargement de l'image (au-dessus de la ligne de flottaison). */
  priority?: boolean;
}

/**
 * Logo officiel Wave (pingouin) utilisé pour illustrer tous les points de
 * contact « Wave » : paiement d'abonnement, campagnes Trouvetou, modes de
 * paiement du shift et passerelles de paiement.
 *
 * L'image est un PNG 256×256 à coins transparents (public/wave-logo.png),
 * généré depuis la capture de référence.
 */
export function WaveLogo({
  size = 20,
  className = "",
  alt = "Wave",
  priority = false,
}: WaveLogoProps) {
  return (
    <Image
      src="/wave-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      priority={priority}
    />
  );
}

export default WaveLogo;
