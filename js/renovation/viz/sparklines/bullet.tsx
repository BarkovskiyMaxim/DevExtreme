import {
  Component,
  ComponentBindings,
  JSXComponent,
  OneWay,
  Ref,
  InternalState,
  Consumer,
  RefObject,
  Nested,
  Fragment,
  Effect,
  ForwardRef,
  Event,
} from 'devextreme-generator/component_declaration/common';
import { combineClasses } from '../../utils/combine_classes';
import { resolveRtlEnabled } from '../../utils/resolve_rtl';
import getElementOffset from '../../utils/get_element_offset';
import { BaseWidgetProps } from '../common/base_props';
import { BaseWidget } from '../common/base_widget';
import {
  createAxis,
  SparklineTooltipData,
  generateCustomizeTooltipCallback,
} from './utils';
import { ConfigContextValue, ConfigContext } from '../../common/config_context';
import { PathSvgElement } from '../common/renderers/svg_path';
import {
  OnTooltipHiddenFn, OnTooltipShownFn, BaseEventData,
} from '../common/types.d';
import { Tooltip as TooltipComponent, TooltipProps } from '../common/tooltip';
import { getFormatValue, pointInCanvas } from '../common/utils';
import eventsEngine from '../../../events/core/events_engine';
import { addNamespace } from '../../../events/utils/index';
import pointerEvents from '../../../events/pointer';
import { EffectReturn } from '../../utils/effect_return.d';
import domAdapter from '../../../core/dom_adapter';

import {
  ArgumentAxisRange, ValueAxisRange, BulletScaleProps,
} from './types.d';

import Number from '../../../core/polyfills/number';

const TARGET_MIN_Y = 0.02;
const TARGET_MAX_Y = 0.98;
const BAR_VALUE_MIN_Y = 0.1;
const BAR_VALUE_MAX_Y = 0.9;

const DEFAULT_CANVAS_WIDTH = 300;
const DEFAULT_CANVAS_HEIGHT = 30;
const DEFAULT_HORIZONTAL_MARGIN = 1;
const DEFAULT_VERTICAL_MARGIN = 2;

const DEFAULT_OFFSET = { top: 0, left: 0 };

const EVENT_NS = 'sparkline-tooltip';
const POINTER_ACTION = addNamespace(
  [pointerEvents.down, pointerEvents.move],
  EVENT_NS,
);

const inCanvas = (canvas: ClientRect, x: number, y: number): boolean => {
  const { width, height } = canvas;
  return pointInCanvas(
    {
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
    },
    x,
    y,
  );
};

const isValidBulletScale = (props: BulletScaleProps): boolean => {
  const {
    value, startScaleValue, endScaleValue, target,
  } = props;
  const isValidBounds = startScaleValue !== endScaleValue;
  const isValidMin = Number.isFinite(startScaleValue);
  const isValidMax = Number.isFinite(endScaleValue);
  const isValidValue = Number.isFinite(value);
  const isValidTarget = Number.isFinite(target);

  return (
    isValidBounds && isValidMax && isValidMin && isValidTarget && isValidValue
  );
};

const getCssClasses = ({ classes }): string => {
  const rootClassesMap = {
    // eslint-disable-next-line spellcheck/spell-checker
    dxb: true,
    'dxb-bullet': true,
    [String(classes)]: !!classes,
  };

  return combineClasses(rootClassesMap);
};

const getContainerCssClasses = ({ className }): string => {
  const rootClassesMap = {
    'dx-bullet': true,
    [String(className)]: !!className,
  };

  return combineClasses(rootClassesMap);
};

export const viewFunction = (viewModel: Bullet): JSX.Element => {
  const scaleProps = viewModel.prepareInternalComponents();
  const isValidBullet = isValidBulletScale(scaleProps);
  const {
    size,
    margin,
    disabled,
    onContentReady,
    color,
    targetColor,
    targetWidth,
  } = viewModel.props;
  const { customizedTooltipProps } = viewModel;
  return (
    <Fragment>
      <BaseWidget
        rootElementRef={viewModel.widgetRootRef}
        ref={viewModel.widgetRef}
        classes={viewModel.cssClasses}
        className={viewModel.cssClassName}
        size={size}
        margin={margin}
        defaultCanvas={viewModel.defaultCanvas}
        disabled={disabled}
        rtlEnabled={viewModel.rtlEnabled}
        onContentReady={onContentReady}
        canvasChange={viewModel.onCanvasChange}
        pointerEvents="visible"
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...viewModel.restAttributes}
      >
        {isValidBullet && (
          <PathSvgElement
            type="line"
            points={viewModel.getBarValueShape(scaleProps)}
            className="dxb-bar-value"
            strokeLineCap="square"
            fill={color}
          />
        )}
        {isValidBullet && viewModel.isValidTarget(scaleProps) && (
          <PathSvgElement
            type="line"
            points={viewModel.getTargetShape(scaleProps)}
            className="dxb-target"
            sharp
            strokeLineCap="square"
            stroke={targetColor}
            strokeWidth={targetWidth}
          />
        )}
        {isValidBullet && viewModel.isValidZeroLevel(scaleProps) && (
          <PathSvgElement
            type="line"
            points={viewModel.getZeroLevelShape()}
            className="dxb-zero-level"
            sharp
            strokeLineCap="square"
            stroke={targetColor}
            strokeWidth={1}
          />
        )}
      </BaseWidget>
      {customizedTooltipProps.enabled && (
        <TooltipComponent
          rootWidget={viewModel.widgetRootRef}
          ref={viewModel.tooltipRef}
          // eslint-disable-next-line react/jsx-props-no-spreading
          {...customizedTooltipProps}
          visible={viewModel.tooltipVisible}
        />
      )}
    </Fragment>
  );
};
@ComponentBindings()
export class BulletProps extends BaseWidgetProps {
  @OneWay() value = 0;

  @OneWay() color = '#e8c267';

  @OneWay() target = 0;

  @OneWay() targetColor = '#666666';

  @OneWay() targetWidth = 4;

  @OneWay() showTarget = true;

  @OneWay() showZeroLevel = true;

  @OneWay() startScaleValue = 0;

  @OneWay() endScaleValue?: number;

  @Nested() tooltip?: TooltipProps;

  @Event() onTooltipHidden?: OnTooltipHiddenFn<BaseEventData>;

  @Event() onTooltipShown?: OnTooltipShownFn<BaseEventData>;
}

@Component({
  defaultOptionRules: null,
  view: viewFunction,
  jQuery: {
    register: true,
  },
})
export class Bullet extends JSXComponent(BulletProps) {
  @Ref() widgetRef!: RefObject<BaseWidget>;

  @Ref() tooltipRef!: RefObject<TooltipComponent>;

  @ForwardRef() widgetRootRef!: RefObject<HTMLDivElement>;

  @InternalState() argumentAxis = createAxis(true);

  @InternalState() valueAxis = createAxis(false);

  @InternalState() canvasState: ClientRect = {
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  };

  @InternalState() offsetState: { top: number; left: number } = DEFAULT_OFFSET;

  @InternalState() tooltipVisible = false;

  @Consumer(ConfigContext)
  config?: ConfigContextValue;

  @Effect()
  tooltipEffect(): EffectReturn {
    const { disabled } = this.props;
    if (!disabled && this.customizedTooltipProps.enabled) {
      const svg = this.widgetRef.current?.svg();
      eventsEngine.on(svg, POINTER_ACTION, this.pointerHandler);
      return (): void => {
        eventsEngine.off(svg, POINTER_ACTION, this.pointerHandler);
      };
    }

    return undefined;
  }

  get cssClasses(): string {
    const { classes } = this.props;
    return getCssClasses({ classes });
  }

  get cssClassName(): string {
    const { className } = this.props;
    return getContainerCssClasses({ className });
  }

  get rtlEnabled(): boolean | undefined {
    const { rtlEnabled } = this.props;
    return resolveRtlEnabled(rtlEnabled, this.config);
  }

  get tooltipEnabled(): boolean {
    return !(this.props.value === undefined && this.props.target === undefined);
  }

  get tooltipData(): SparklineTooltipData {
    const { value, target, tooltip } = this.props;
    const valueText = getFormatValue(value, undefined, {
      format: tooltip?.format,
    });
    const targetText = getFormatValue(target, undefined, {
      format: tooltip?.format,
    });

    return {
      originalValue: value,
      originalTarget: target,
      value: valueText,
      target: targetText,
      valueTexts: ['Actual Value:', valueText, 'Target Value:', targetText],
    };
  }

  get tooltipCoords(): { x: number; y: number } {
    const canvas = this.canvasState;
    const rootOffset = this.offsetState;
    return {
      x: canvas.width / 2 + rootOffset.left,
      y: canvas.height / 2 + rootOffset.top,
    };
  }

  get customizedTooltipProps(): Partial<TooltipProps> {
    const { tooltip, onTooltipHidden, onTooltipShown } = this.props;
    const customProps = {
      enabled: this.tooltipEnabled,
      eventData: { component: this.widgetRef },
      onTooltipHidden,
      onTooltipShown,
      customizeTooltip: generateCustomizeTooltipCallback(
        tooltip?.customizeTooltip,
        tooltip?.font,
        this.rtlEnabled,
      ),
      data: this.tooltipData,
      ...this.tooltipCoords,
    };

    if (!tooltip) {
      return customProps;
    }

    return {
      ...tooltip,
      ...customProps,
      enabled: tooltip.enabled !== false && this.tooltipEnabled,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  get defaultCanvas(): ClientRect {
    return {
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
      left: DEFAULT_HORIZONTAL_MARGIN,
      right: DEFAULT_HORIZONTAL_MARGIN,
      top: DEFAULT_VERTICAL_MARGIN,
      bottom: DEFAULT_VERTICAL_MARGIN,
    };
  }

  onCanvasChange(canvas: ClientRect): void {
    this.canvasState = canvas;
    const svgElement = this.widgetRef.current?.svg() || undefined;
    this.offsetState = getElementOffset(svgElement) ?? DEFAULT_OFFSET;
  }

  prepareInternalComponents(): BulletScaleProps {
    const props = this.prepareScaleProps();

    this.updateWidgetElements(props);

    return props;
  }

  updateWidgetElements(props: BulletScaleProps): void {
    const canvas = this.canvasState;
    const ranges = this.updateRange(props);

    this.argumentAxis.update(ranges.arg, canvas, undefined);
    this.valueAxis.update(ranges.val, canvas, undefined);
  }

  prepareScaleProps(): BulletScaleProps {
    let level;
    const tmpProps: BulletScaleProps = {
      inverted: false,
      value: this.props.value ?? 0,
      target: this.props.target ?? 0,
      startScaleValue: 0,
      endScaleValue: 0,
    };

    const { value, target } = tmpProps;

    if (this.props.startScaleValue === undefined) {
      tmpProps.startScaleValue = target < value ? target : value;
      tmpProps.startScaleValue = tmpProps.startScaleValue < 0 ? tmpProps.startScaleValue : 0;
    } else {
      tmpProps.startScaleValue = this.props.startScaleValue;
    }
    // eslint-disable-next-line no-nested-ternary
    tmpProps.endScaleValue = this.props.endScaleValue === undefined
      ? target > value
        ? target
        : value
      : this.props.endScaleValue;

    const { startScaleValue, endScaleValue } = tmpProps;

    if (endScaleValue < startScaleValue) {
      level = endScaleValue;
      tmpProps.endScaleValue = startScaleValue;
      tmpProps.startScaleValue = level;
      tmpProps.inverted = true;
    }

    return tmpProps;
  }

  updateRange(
    scaleProps: BulletScaleProps,
  ): { arg: ArgumentAxisRange; val: ValueAxisRange } {
    const { startScaleValue, endScaleValue, inverted } = scaleProps;

    return {
      arg: {
        invert: this.rtlEnabled ? !inverted : inverted,
        min: startScaleValue,
        max: endScaleValue,
        axisType: 'continuous',
        dataType: 'numeric',
      },
      val: {
        min: 0,
        max: 1,
        axisType: 'continuous',
        dataType: 'numeric',
      },
    };
  }

  getBarValueShape(
    props: BulletScaleProps,
  ): [number, number, number, number, number, number, number, number] {
    const translatorX = this.argumentAxis.getTranslator();
    const translatorY = this.valueAxis.getTranslator();
    const { value, startScaleValue, endScaleValue } = props;
    const y2 = translatorY.translate(BAR_VALUE_MIN_Y);
    const y1 = translatorY.translate(BAR_VALUE_MAX_Y);
    let x1;
    let x2;

    if (value > 0) {
      x1 = startScaleValue <= 0 ? 0 : startScaleValue;
      // eslint-disable-next-line no-nested-ternary
      x2 = value >= endScaleValue ? endScaleValue : value < x1 ? x1 : value;
    } else {
      x1 = endScaleValue >= 0 ? 0 : endScaleValue;
      // eslint-disable-next-line no-nested-ternary
      x2 = value < startScaleValue ? startScaleValue : value > x1 ? x1 : value;
    }

    x1 = translatorX.translate(x1);
    x2 = translatorX.translate(x2);

    return [x1, y1, x2, y1, x2, y2, x1, y2];
  }

  getSimpleShape(value: number): [number, number, number, number] {
    const translatorY = this.valueAxis.getTranslator();
    const x = this.argumentAxis.getTranslator().translate(value);

    return [
      x,
      translatorY.translate(TARGET_MIN_Y),
      x,
      translatorY.translate(TARGET_MAX_Y),
    ];
  }

  getTargetShape(props: BulletScaleProps): [number, number, number, number] {
    return this.getSimpleShape(props.target);
  }

  getZeroLevelShape(): [number, number, number, number] {
    return this.getSimpleShape(0);
  }

  isValidTarget(scaleProps: BulletScaleProps): boolean {
    const { target, startScaleValue, endScaleValue } = scaleProps;
    const { showTarget } = this.props;

    return !(target > endScaleValue || target < startScaleValue || !showTarget);
  }

  isValidZeroLevel(scaleProps: BulletScaleProps): boolean {
    const { startScaleValue, endScaleValue } = scaleProps;
    const { showZeroLevel } = this.props;

    return !(endScaleValue < 0 || startScaleValue > 0 || !showZeroLevel);
  }

  pointerHandler(): void {
    this.tooltipVisible = true;
    eventsEngine.on(
      domAdapter.getDocument(),
      POINTER_ACTION,
      this.pointerOutHandler,
    );
  }

  pointerOutHandler({ pageX, pageY }): void {
    const { left, top } = this.offsetState;
    const x = Math.floor(pageX - left);
    const y = Math.floor(pageY - top);

    if (!inCanvas(this.canvasState, x, y)) {
      this.tooltipVisible = false;
      eventsEngine.off(
        domAdapter.getDocument(),
        POINTER_ACTION,
        this.pointerOutHandler,
      );
    }
  }
}
