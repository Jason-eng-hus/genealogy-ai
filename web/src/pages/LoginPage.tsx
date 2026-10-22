import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Typography,
} from 'antd';
import { useState } from 'react';
import {
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';

interface LoginFormValues {
  username: string;
  password: string;
}

function safeRedirect(value: string | null): string {
  if (
    value === null ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/';
  }

  return value;
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get('redirect'));
  const navigate = useNavigate();
  const { user, isLoading, signIn } = useAuth();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user !== null) {
    return <Navigate to={redirect} replace />;
  }

  const handleFinish = async (values: LoginFormValues): Promise<void> => {
    setSubmitting(true);
    setError('');

    try {
      await signIn(values.username, values.password);
      navigate(redirect, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '登录失败，请稍后重试。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="login-card">
      <div className="login-card__header">
        <span className="login-card__seal" aria-hidden="true">
          谱
        </span>
        <div className="login-card__heading">
          <Typography.Title level={3} className="login-card__title">
            登录 AI 家谱编辑系统
          </Typography.Title>
          <Typography.Text type="secondary">
            仅限授权用户使用，关键操作将写入审计日志。
          </Typography.Text>
        </div>
      </div>

      {error !== '' && (
        <Alert
          className="login-card__alert"
          type="error"
          showIcon
          message={error}
        />
      )}

      <Form<LoginFormValues>
        layout="vertical"
        requiredMark={false}
        onFinish={handleFinish}
      >
        <Form.Item
          name="username"
          label="用户名"
          rules={[{ required: true, message: '请输入用户名。' }]}
        >
          <Input
            size="large"
            autoComplete="username"
            placeholder="请输入用户名"
          />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          rules={[{ required: true, message: '请输入密码。' }]}
        >
          <Input.Password
            size="large"
            autoComplete="current-password"
            placeholder="请输入密码"
          />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={submitting}
        >
          登录
        </Button>
      </Form>

      <Typography.Paragraph type="secondary" className="login-card__hint">
        登录失败次数过多时会被暂时限制，请稍后再试。
      </Typography.Paragraph>
    </Card>
  );
}
