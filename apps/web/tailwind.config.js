/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /**
       * 设计基调（PRD 13.1）：温暖、安静、有生命力、不吵闹。
       * 明确反对：纯黑科技感、KPI 仪表盘式压迫感、荧光色游戏 UI。
       * 因此主色用暖橙而非蓝紫，中性色用暖灰而非冷灰。
       */
      colors: {
        ink: {
          50: '#faf7f4',
          100: '#f2ece6',
          200: '#e4d9d0',
          300: '#cbb9ab',
          400: '#a8927f',
          500: '#8a7360',
          600: '#6d5a4b',
          700: '#54453a',
          800: '#3a2f28',
          900: '#241d18',
        },
        /** 主强调色：专注与进度 */
        amber: {
          soft: '#f6c177',
          base: '#e8a33d',
          deep: '#b87a1f',
        },
        /** 成功/完成 */
        moss: {
          soft: '#a8c197',
          base: '#7ba05b',
          deep: '#557a3a',
        },
        /** 警示/越界（刻意不发荧光，避免"游戏化惩罚"观感） */
        clay: {
          soft: '#d99a86',
          base: '#c06a4d',
          deep: '#8f4a34',
        },
      },
      borderRadius: {
        card: '14px',
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Hiragino Sans GB"',
          'system-ui',
          'sans-serif',
        ],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'coin-fly': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-28px) scale(1.15)' },
        },
        // ── 宠物动作（CSS 渲染器用；见 features/pet/renderer.ts）──
        'pet-idle': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-4px) scale(1.01)' },
        },
        'pet-blink': {
          '0%, 100%': { transform: 'scaleY(1)' },
          '45%, 55%': { transform: 'scaleY(0.08)' },
        },
        'pet-look': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
        'pet-yawn': {
          '0%, 100%': { transform: 'scale(1, 1)' },
          '50%': { transform: 'scale(0.95, 1.08)' },
        },
        'pet-wag': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg)' },
          '75%': { transform: 'rotate(5deg)' },
        },
        'pet-reaction': {
          '0%': { transform: 'scale(1) rotate(0deg)' },
          '30%': { transform: 'scale(1.12) rotate(-4deg)' },
          '60%': { transform: 'scale(1.06) rotate(3deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        },
        'pet-cheer': {
          '0%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-16px) scale(1.08)' },
          '55%': { transform: 'translateY(0) scale(0.97)' },
          '75%': { transform: 'translateY(-6px)' },
        },
        'pet-eat': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(3px) scale(1.03, 0.97)' },
        },
        'pet-wilt': {
          '0%, 100%': { transform: 'translateY(3px) rotate(-3deg)' },
          '50%': { transform: 'translateY(6px) rotate(-5deg)' },
        },
        'pet-dress': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05) rotate(2deg)' },
        },
        'heart-float': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(0.8)' },
          '100%': { opacity: '0', transform: 'translateY(-32px) scale(1.2)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 200ms ease-out',
        'coin-fly': 'coin-fly 900ms ease-out forwards',
        'pet-idle': 'pet-idle 2.4s ease-in-out infinite',
        'pet-blink': 'pet-blink 200ms ease-in-out',
        'pet-look': 'pet-look 1.6s ease-in-out',
        'pet-yawn': 'pet-yawn 1.4s ease-in-out',
        'pet-wag': 'pet-wag 1s ease-in-out',
        'pet-reaction': 'pet-reaction 900ms ease-out',
        'pet-cheer': 'pet-cheer 1.2s ease-out',
        'pet-eat': 'pet-eat 1.6s ease-in-out',
        'pet-wilt': 'pet-wilt 2s ease-in-out infinite',
        'pet-dress': 'pet-dress 800ms ease-out',
        'heart-float': 'heart-float 900ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
