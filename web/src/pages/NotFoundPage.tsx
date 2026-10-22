import { Button, Result, Space } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="404"
      subTitle="您访问的页面不存在，可能已被移动或删除。"
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate('/')}>
            返回仪表盘
          </Button>
          <Button onClick={() => navigate(-1)}>返回上一页</Button>
        </Space>
      }
    />
  );
}
