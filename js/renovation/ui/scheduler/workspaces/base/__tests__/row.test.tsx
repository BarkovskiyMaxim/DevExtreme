import React from 'react';
import { shallow } from 'enzyme';
import { viewFunction as RowView, Row } from '../row';
import { VirtualCell } from '../virtual-cell';

jest.mock('../../utils', () => ({
  addHeightToStyle: jest.fn(() => 'style'),
}));

describe('RowBase', () => {
  describe('Render', () => {
    const render = (viewModel) => shallow(RowView({
      props: { ...viewModel.props },
      ...viewModel,
    }) as any);

    it('should pass className', () => {
      const row = render({
        props: { className: 'custom-class' },
      });

      expect(row.is('.custom-class'))
        .toBe(true);
    });

    it('should render children', () => {
      const row = render({ props: { children: <div className="child" /> } });

      expect(row.find('.child').exists())
        .toBe(true);
    });

    [{
      hasLeftVirtualCell: false,
      hasRightVirtualCell: false,
      expected: {
        selectors: ['.child'],
        widths: [50],
      },
    }, {
      hasLeftVirtualCell: true,
      expected: {
        selectors: [VirtualCell, '.child'],
        leftVirtualCellWidth: 100,
        widths: [100, 50],
      },
    }, {
      hasRightVirtualCell: true,
      expected: {
        selectors: ['.child', VirtualCell],
        widths: [50, 200],
      },
    }, {
      hasLeftVirtualCell: true,
      hasRightVirtualCell: true,
      expected: {
        selectors: [VirtualCell, '.child', VirtualCell],
        widths: [100, 50, 200],
      },
    }].forEach((option) => {
      it(`should render virtual cells correctly if 'hasLeftVirtualCell' is ${option.hasLeftVirtualCell},
        'hasRightVirtualCell' is ${option.hasRightVirtualCell}`, () => {
        const row = render({
          props: {
            leftVirtualCellWidth: 100,
            rightVirtualCellWidth: 200,
            children: <td className="child" width={50} />,
          },
          hasLeftVirtualCell: option.hasLeftVirtualCell,
          hasRightVirtualCell: option.hasRightVirtualCell,
        });

        const { expected } = option;

        expect(row.children())
          .toHaveLength(expected.selectors.length);

        expected.selectors.forEach((selector, index) => {
          const child = row.childAt(index);

          expect(child.is(selector))
            .toBe(true);

          expect(child.prop('width'))
            .toEqual(expected.widths[index]);
        });
      });
    });
  });

  describe('Logic', () => {
    describe('Getters', () => {
      describe('leftVirtualCellWidth', () => {
        [{
          leftVirtualCellWidth: 0,
          hasLeftVirtualCell: false,
        }, {
          leftVirtualCellWidth: 10,
          hasLeftVirtualCell: true,
        }].forEach((option) => {
          it(`should determine "hasLeftVirtualCell" correctly if leftVirtualCellWidth is ${option.leftVirtualCellWidth}`, () => {
            const row = new Row({
              leftVirtualCellWidth: option.leftVirtualCellWidth,
            });

            expect(option.hasLeftVirtualCell)
              .toBe(row.hasLeftVirtualCell);
          });
        });
      });

      describe('rightVirtualCellWidth', () => {
        [{
          rightVirtualCellWidth: 0,
          hasRightVirtualCell: false,
        }, {
          rightVirtualCellWidth: 10,
          hasRightVirtualCell: true,
        }].forEach((option) => {
          it(`should determine "hasRightVirtualCell" correctly if rightVirtualCellWidth is ${option.rightVirtualCellWidth}`, () => {
            const row = new Row({
              rightVirtualCellWidth: option.rightVirtualCellWidth,
            });

            expect(option.hasRightVirtualCell)
              .toBe(row.hasRightVirtualCell);
          });
        });
      });
    });
  });
});
