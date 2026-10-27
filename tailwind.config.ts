import type { Config } from "tailwindcss";

/**
 * Cinza quente da marca no lugar dos cinzas frios do Tailwind (gray, slate,
 * zinc, neutral, stone), passo a passo com a MESMA luminosidade do original:
 * todo par de texto e fundo que passava no contraste continua passando. Lote 5
 * do checkup de usabilidade: telas antigas com `text-gray-500` destoavam do
 * creme e do carvão da marca.
 */
const cinzaQuente = {
	50: 'hsl(60 10% 97.8%)',
	100: 'hsl(60 10% 95.3%)',
	200: 'hsl(60 10% 89.6%)',
	300: 'hsl(60 10% 81.8%)',
	400: 'hsl(60 10% 60.3%)',
	500: 'hsl(60 10% 41%)',
	600: 'hsl(60 10% 30.4%)',
	700: 'hsl(60 10% 23.2%)',
	800: 'hsl(60 10% 14.6%)',
	900: 'hsl(60 10% 8.7%)',
	950: 'hsl(60 10% 2.6%)',
};

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			/*
			 * Cor de TEXTO separada da cor de fundo (lote 5, contraste AA): a lima,
			 * o lilás e o âmbar são fundos. `text-primary` sobre branco dava 1,4:1.
			 * As tintas moram em index.css (--*-ink); no tema escuro voltam a ser a
			 * cor clara. `bg-primary`, `border-primary` etc. não mudam.
			 */
			textColor: {
				primary: { DEFAULT: 'hsl(var(--primary-ink))' },
				accent: { DEFAULT: 'hsl(var(--accent-ink))' },
				warning: { DEFAULT: 'hsl(var(--warning-ink))' },
				info: 'hsl(var(--info-ink))',
				brand: {
					primary: 'hsl(var(--primary-ink))',
					secondary: 'hsl(var(--accent-ink))',
				},
				status: {
					warning: 'hsl(var(--warning-ink))',
					info: 'hsl(var(--info-ink))',
				},
			},
			colors: {
				gray: cinzaQuente,
				slate: cinzaQuente,
				zinc: cinzaQuente,
				neutral: cinzaQuente,
				stone: cinzaQuente,
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				// Semantic status tokens exposed at top level so `bg-success`, `text-warning`,
				// `border-warning/30` etc. resolve. They wire the existing CSS vars (also kept
				// nested under `status.*` for backwards compatibility).
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				error: 'hsl(var(--error))',
				info: 'hsl(var(--info))',
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// ConvoFlow Brand Colors
				brand: {
					primary: 'hsl(var(--brand-primary))',
					secondary: 'hsl(var(--brand-secondary))',
					light: 'hsl(var(--brand-light))',
					dark: 'hsl(var(--brand-dark))'
				},
				business: {
					dark: 'hsl(var(--business-dark))',
					medium: 'hsl(var(--business-medium))',
					light: 'hsl(var(--business-light))'
				},
				status: {
					success: 'hsl(var(--success))',
					warning: 'hsl(var(--warning))',
					error: 'hsl(var(--error))',
					info: 'hsl(var(--info))'
				},
				dashboard: {
					bg: 'hsl(var(--dashboard-bg))',
					sidebar: 'hsl(var(--sidebar-bg))',
					navbar: 'hsl(var(--navbar-bg))'
				}
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-success': 'var(--gradient-success)',
				'gradient-background': 'var(--gradient-background)',
				// Dotted background patterns (nova paleta)
				'dot-thick-neutral-300': `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='%23c9cdb0' fill-opacity='0.4' fill-rule='evenodd'%3e%3ccircle cx='2' cy='2' r='1'/%3e%3c/g%3e%3c/svg%3e")`,
				'dot-thick-neutral-800': `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='%2349511d' fill-opacity='0.4' fill-rule='evenodd'%3e%3ccircle cx='2' cy='2' r='1'/%3e%3c/g%3e%3c/svg%3e")`,
				'dot-thick-brand-primary': `url("data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='%23dae27c' fill-opacity='0.4' fill-rule='evenodd'%3e%3ccircle cx='2' cy='2' r='1'/%3e%3c/g%3e%3c/svg%3e")`
			},
			boxShadow: {
				'soft': 'var(--shadow-soft)',
				'medium': 'var(--shadow-medium)',
				'strong': 'var(--shadow-strong)'
			},
			transitionTimingFunction: {
				'fast': 'var(--transition-fast)',
				'normal': 'var(--transition-normal)',
				'slow': 'var(--transition-slow)'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			fontFamily: {
				display: ['"NewBlack Typeface"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				sans: ['Inter', '"NewBlack Typeface"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				// Brief background pulse when a new message lands on a non-selected conversation.
				'flash-highlight': {
					'0%, 100%': { backgroundColor: 'transparent' },
					'25%': { backgroundColor: 'hsl(var(--primary) / 0.12)' }
				},
				// Slide-down reveal for the in-conversation search bar.
				'slide-down': {
					from: { transform: 'translateY(-8px)', opacity: '0' },
					to: { transform: 'translateY(0)', opacity: '1' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'flash-highlight': 'flash-highlight 600ms ease-out',
				'slide-down': 'slide-down 160ms ease-out'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
