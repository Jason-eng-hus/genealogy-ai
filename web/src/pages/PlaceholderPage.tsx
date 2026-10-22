import { Card, Empty, Typography } from 'antd';

export interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <Card className="app-placeholder-card">
      <Typography.Title level={4}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {description}
      </Typography.Paragraph>
      <div className="app-placeholder">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="页面骨架已就位，业务功能将在后续工作包实现"
        />
      </div>
    </Card>
  );
}
