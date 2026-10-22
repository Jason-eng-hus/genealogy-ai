import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Select,
  Space,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
} from '@shared/constants/audit.ts';
import type { AuditLogQuery } from '@shared/types/audit.ts';

const { RangePicker } = DatePicker;

export type AuditFilterValues = Pick<
  AuditLogQuery,
  'action' | 'entityType' | 'entityId' | 'actor' | 'from' | 'to'
>;

interface FilterFormValues {
  action?: AuditFilterValues['action'];
  entityType?: AuditFilterValues['entityType'];
  entityId?: string;
  actor?: string;
  range?: [Dayjs | null, Dayjs | null] | null;
}

export interface AuditFiltersProps {
  loading: boolean;
  onSearch: (filters: AuditFilterValues) => void;
  onReset: () => void;
}

const actionOptions = AUDIT_ACTIONS.map((action) => ({
  value: action,
  label: AUDIT_ACTION_LABELS[action],
}));

const entityOptions = AUDIT_ENTITY_TYPES.map((entityType) => ({
  value: entityType,
  label: AUDIT_ENTITY_LABELS[entityType],
}));

export function AuditFilters({
  loading,
  onSearch,
  onReset,
}: AuditFiltersProps) {
  const [form] = Form.useForm<FilterFormValues>();

  const handleFinish = (values: FilterFormValues): void => {
    const filters: AuditFilterValues = {};

    if (values.action !== undefined) {
      filters.action = values.action;
    }

    if (values.entityType !== undefined) {
      filters.entityType = values.entityType;
    }

    if (values.entityId !== undefined && values.entityId.trim() !== '') {
      filters.entityId = values.entityId.trim();
    }

    if (values.actor !== undefined && values.actor.trim() !== '') {
      filters.actor = values.actor.trim();
    }

    const [start, end] = values.range ?? [];

    if (start !== null && start !== undefined) {
      filters.from = start.startOf('day').toISOString();
    }

    if (end !== null && end !== undefined) {
      filters.to = end.endOf('day').toISOString();
    }

    onSearch(filters);
  };

  const handleReset = (): void => {
    form.resetFields();
    onReset();
  };

  return (
    <Form<FilterFormValues>
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      requiredMark={false}
    >
      <Row gutter={16}>
        <Col xs={24} md={12} xl={6}>
          <Form.Item name="action" label="动作">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="全部动作"
              options={actionOptions}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Form.Item name="entityType" label="实体类型">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="全部实体"
              options={entityOptions}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Form.Item name="entityId" label="实体 ID">
            <Input allowClear placeholder="精确匹配实体 ID" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Form.Item name="actor" label="操作人">
            <Input allowClear placeholder="用户名或显示名" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Form.Item name="range" label="时间范围">
            <RangePicker
              style={{ width: '100%' }}
              allowClear
              placeholder={['开始日期', '结束日期']}
              disabledDate={(current) =>
                current.isAfter(dayjs().endOf('day'))
              }
            />
          </Form.Item>
        </Col>
        <Col xs={24} xl={16}>
          <Form.Item label=" ">
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
              >
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
