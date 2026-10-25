import * as path from 'path';
import * as ejs from 'ejs';

export const VIEWS_DIR = path.join(__dirname, 'views');

export interface LayoutOptions {
  title?: string;
  brand?: string;
  menuItems?: Array<{ label: string; url: string; active?: boolean }>;
}

export function renderLayout(contentHtml: string, options: LayoutOptions = {}): Promise<string> {
  const layoutPath = path.join(VIEWS_DIR, 'layout.ejs');
  return ejs.renderFile(layoutPath, {
    content: contentHtml,
    ...options
  });
}

export function renderView(viewName: string, data: Record<string, any> = {}, options: LayoutOptions = {}): Promise<string> {
  const viewPath = path.join(VIEWS_DIR, `${viewName}.ejs`);
  return ejs.renderFile(viewPath, data).then(contentHtml => renderLayout(contentHtml, options));
}

export function renderComponent(componentName: string, data: Record<string, any> = {}): Promise<string> {
  const componentPath = path.join(VIEWS_DIR, 'components', `${componentName}.ejs`);
  return ejs.renderFile(componentPath, data);
}
