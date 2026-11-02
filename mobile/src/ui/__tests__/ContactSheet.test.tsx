import { fireEvent, render, screen } from '@testing-library/react-native';

import { ContactSheet } from '../ContactSheet';

const TODAY = '2026-11-02';

function setup() {
  const onSave = jest.fn();
  const onClose = jest.fn();
  return {
    onSave,
    onClose,
    ui: <ContactSheet visible customerName="أحمد" onClose={onClose} onSave={onSave} today={TODAY} />,
  };
}

test('choosing a promise chip then saving passes the date', async () => {
  const { ui, onSave } = setup();
  await render(ui);
  expect(screen.getByText('ملاحظة على أحمد')).toBeTruthy();
  await fireEvent.press(screen.getByText('بعد 3 أيام'));
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ' }));
  expect(onSave).toHaveBeenCalledWith({ note: '', promiseDate: '2026-11-05' });
});

test('a note alone saves without a promise date', async () => {
  const { ui, onSave } = setup();
  await render(ui);
  await fireEvent.changeText(screen.getByLabelText('الملاحظة'), '  هيدفع الأسبوع الجاي ');
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ' }));
  expect(onSave).toHaveBeenCalledWith({ note: 'هيدفع الأسبوع الجاي', promiseDate: undefined });
});

test('an invalid typed date shows an error and does not save', async () => {
  const { ui, onSave } = setup();
  await render(ui);
  await fireEvent.changeText(screen.getByLabelText('أو اكتب التاريخ (يوم/شهر)'), '31/2');
  expect(screen.getByText('التاريخ مش صحيح')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ' }));
  expect(onSave).not.toHaveBeenCalled();
});

test('on a month last day, tomorrow and first-of-next-month chips select independently', async () => {
  const onSave = jest.fn();
  await render(<ContactSheet visible customerName="أحمد" onClose={jest.fn()} onSave={onSave} today="2026-11-30" />);
  await fireEvent.press(screen.getByText('بكره'));
  expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
  await fireEvent.press(screen.getByText('أول الشهر الجاي'));
  expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ' }));
  expect(onSave).toHaveBeenCalledWith({ note: '', promiseDate: '2026-12-01' });
});

test('a valid typed date is saved', async () => {
  const { ui, onSave } = setup();
  await render(ui);
  await fireEvent.changeText(screen.getByLabelText('أو اكتب التاريخ (يوم/شهر)'), '15/11');
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ' }));
  expect(onSave).toHaveBeenCalledWith({ note: '', promiseDate: '2026-11-15' });
});

test('save is disabled with no note and no promise', async () => {
  const { ui, onSave } = setup();
  await render(ui);
  const save = screen.getByRole('button', { name: 'حفظ' });
  expect(save.props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(save);
  expect(onSave).not.toHaveBeenCalled();
});

test('a failed save keeps the sheet open with the error and the typed text', async () => {
  const onSave = jest.fn().mockResolvedValue(false);
  const onClose = jest.fn();
  await render(<ContactSheet visible customerName="أحمد" onClose={onClose} onSave={onSave} today={TODAY} />);
  await fireEvent.changeText(screen.getByLabelText('الملاحظة'), 'هيدفع');
  await fireEvent.press(screen.getByRole('button', { name: 'حفظ' }));
  expect(await screen.findByText('ماتحفظتش، جرّب تاني')).toBeTruthy();
  expect(screen.getByLabelText('الملاحظة').props.value).toBe('هيدفع');
  expect(onClose).not.toHaveBeenCalled();
});

test('رجوع closes', async () => {
  const { ui, onClose } = setup();
  await render(ui);
  await fireEvent.press(screen.getByRole('button', { name: 'رجوع' }));
  expect(onClose).toHaveBeenCalled();
});
