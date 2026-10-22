import type { ThemeConfig } from 'antd';
import { designTokens } from './tokens';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: designTokens.colorPrimary,
    colorInfo: designTokens.colorPrimary,
    colorSuccess: designTokens.colorSuccess,
    colorWarning: designTokens.colorWarning,
    colorError: designTokens.colorError,
    colorBgLayout: designTokens.colorPaper,
    colorBgContainer: designTokens.colorSurface,
    colorTextBase: designTokens.colorText,
    colorBorder: designTokens.colorBorder,
    borderRadius: designTokens.radius,
    fontFamily: designTokens.fontFamilySans,
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: designTokens.colorSurface,
      headerHeight: designTokens.headerHeight,
      headerPadding: '0 24px',
      siderBg: designTokens.colorSurface,
      bodyBg: designTokens.colorPaper,
      footerBg: 'transparent',
      footerPadding: '12px 24px',
    },
    Menu: {
      itemBorderRadius: designTokens.radius,
      itemMarginInline: 12,
      itemHeight: 42,
      itemColor: designTokens.colorTextSecondary,
      itemHoverBg: designTokens.colorPaper,
      itemSelectedBg: designTokens.colorSelectedBg,
      itemSelectedColor: designTokens.colorPrimary,
    },
    Card: {
      borderRadiusLG: designTokens.radiusLarge,
    },
    Button: {
      controlHeight: 36,
    },
  },
};
