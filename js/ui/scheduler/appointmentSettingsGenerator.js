import dateUtils from '../../core/utils/date';
import { isEmptyObject } from '../../core/utils/type';
import { extend } from '../../core/utils/extend';
import { getRecurrenceProcessor } from './recurrence';
import timeZoneUtils from './utils.timeZone.js';

const toMs = dateUtils.dateToMilliseconds;

export class AppointmentSettingsGenerator {
    constructor(scheduler) {
        this.scheduler = scheduler;

        this.settingsStrategy = this.scheduler.isVirtualScrolling()
            ? new AppointmentSettingsGeneratorVirtualStrategy(this.scheduler)
            : new AppointmentSettingsGeneratorBaseStrategy(this.scheduler);
    }

    create(rawAppointment) {
        return this.settingsStrategy.create(rawAppointment);
    }
}

export class AppointmentSettingsGeneratorBaseStrategy {
    constructor(scheduler) {
        this.scheduler = scheduler;
    }

    get timeZoneCalculator() {
        return this.scheduler.timeZoneCalculator;
    }

    get workspace() { return this.scheduler.getWorkSpace(); }
    get viewDataProvider() { return this.workspace.viewDataProvider; }

    create(rawAppointment) {
        const { scheduler } = this;
        const appointment = scheduler.createAppointmentAdapter(rawAppointment);
        const itemResources = scheduler._resourcesManager.getResourcesFromItem(rawAppointment);
        const isAllDay = this._isAllDayAppointment(rawAppointment);

        let appointmentList = this._createAppointments(appointment, itemResources);

        if(this._canProcessNotNativeTimezoneDates(appointment)) {
            appointmentList = this._getProcessedNotNativeTimezoneDates(appointmentList, appointment);
        }

        let gridAppointmentList = this._createGridAppointmentList(appointmentList, appointment);

        gridAppointmentList = this._cropAppointmentsByStartDayHour(gridAppointmentList, rawAppointment, isAllDay);

        gridAppointmentList = this._getProcessedLongAppointmentsIfRequired(gridAppointmentList, appointment);

        const appointmentInfos = this.createAppointmentInfos(
            gridAppointmentList,
            itemResources,
            isAllDay,
            appointment.isRecurrent
        );

        return appointmentInfos;
    }

    _isAllDayAppointment(rawAppointment) {
        return this.scheduler.appointmentTakesAllDay(rawAppointment) && this.workspace.supportAllDayRow();
    }

    _createAppointments(appointment, resources) {
        let appointments = this._createRecurrenceAppointments(appointment, resources);

        if(!appointment.isRecurrent && appointments.length === 0) {
            appointments.push({
                startDate: appointment.startDate,
                endDate: appointment.endDate
            });
        }

        // T817857
        appointments = appointments.map(item => {
            const {
                startDate,
                endDate
            } = item;
            const endTime = endDate?.getTime();

            if(startDate.getTime() === endTime) {
                endDate.setTime(endTime + toMs('minute'));
            }

            return item;
        });

        return appointments;
    }

    _canProcessNotNativeTimezoneDates(appointment) {
        const timeZoneName = this.scheduler.option('timeZone');
        const isTimeZoneSet = !isEmptyObject(timeZoneName);

        if(!isTimeZoneSet) {
            return false;
        }

        if(!appointment.isRecurrent) {
            return false;
        }

        return !timeZoneUtils.isEqualLocalTimeZone(timeZoneName, appointment.startDate);
    }

    _getProcessedNotNativeDateIfCrossDST(date, offset) {
        if(offset < 0) { // summer time
            const newDate = new Date(date);

            const newDateMinusOneHour = new Date(newDate);
            newDateMinusOneHour.setHours(newDateMinusOneHour.getHours() - 1);

            const newDateOffset = this.timeZoneCalculator.getOffsets(newDate).common;
            const newDateMinusOneHourOffset = this.timeZoneCalculator.getOffsets(newDateMinusOneHour).common;

            if(newDateOffset !== newDateMinusOneHourOffset) {
                return 0;
            }
        }

        return offset;
    }

    _getProcessedNotNativeTimezoneDates(appointmentList, appointment) {
        const startDateRange = appointment.startDate;
        const endDateRange = appointmentList[appointmentList.length - 1].endDate;

        const startDateRangeOffset = this.timeZoneCalculator.getOffsets(startDateRange).common;
        const endDateRangeOffset = this.timeZoneCalculator.getOffsets(endDateRange).common;

        const isChangeOffsetInRange = startDateRangeOffset !== endDateRangeOffset;

        if(isChangeOffsetInRange) {
            return appointmentList.map(item => {
                let diffStartDateOffset = this.timeZoneCalculator.getOffsets(appointment.startDate).common - this.timeZoneCalculator.getOffsets(item.startDate).common;
                let diffEndDateOffset = this.timeZoneCalculator.getOffsets(appointment.endDate).common - this.timeZoneCalculator.getOffsets(item.endDate).common;

                diffStartDateOffset = this._getProcessedNotNativeDateIfCrossDST(item.startDate, diffStartDateOffset);
                diffEndDateOffset = this._getProcessedNotNativeDateIfCrossDST(item.endDate, diffEndDateOffset);

                const newStartDate = new Date(item.startDate.getTime() + diffStartDateOffset * toMs('hour'));
                let newEndDate = new Date(item.endDate.getTime() + diffEndDateOffset * toMs('hour'));

                const testNewStartDate = this.timeZoneCalculator.createDate(newStartDate, { path: 'toGrid' });
                const testNewEndDate = this.timeZoneCalculator.createDate(newEndDate, { path: 'toGrid' });

                if(appointment.duration > testNewEndDate.getTime() - testNewStartDate.getTime()) {
                    newEndDate = new Date(newStartDate.getTime() + appointment.duration);
                }

                return {
                    ...item,
                    startDate: newStartDate,
                    endDate: newEndDate
                };
            });
        }

        return appointmentList;
    }

    _getProcessedLongAppointmentsIfRequired(gridAppointmentList, appointment) {
        const rawAppointment = appointment.source();

        const allDay = this.scheduler.appointmentTakesAllDay(rawAppointment);
        const dateRange = this.workspace.getDateRange();
        const renderingStrategy = this.scheduler.getLayoutManager().getRenderingStrategyInstance();

        if(renderingStrategy.needSeparateAppointment(allDay)) {
            let longStartDateParts = [];
            let resultDates = [];

            gridAppointmentList.forEach(gridAppointment => {
                const maxDate = new Date(dateRange[1]);
                const endDateOfPart = renderingStrategy.normalizeEndDateByViewEnd(rawAppointment, gridAppointment.endDate);

                longStartDateParts = dateUtils.getDatesOfInterval(gridAppointment.startDate, endDateOfPart, {
                    milliseconds: this.scheduler.getWorkSpace().getIntervalDuration(allDay)
                });

                const list = longStartDateParts.filter(startDatePart => new Date(startDatePart) < maxDate)
                    .map(date => {
                        return {
                            startDate: date,
                            endDate: new Date(new Date(date).setMilliseconds(appointment.duration)),
                            source: gridAppointment.source
                        };
                    });

                resultDates = resultDates.concat(list);
            });

            gridAppointmentList = resultDates;
        }

        return gridAppointmentList;
    }

    _createGridAppointmentList(appointmentList, appointment) {
        return appointmentList.map(source => {
            const offsetDifference = appointment.startDate.getTimezoneOffset() - source.startDate.getTimezoneOffset();

            if(offsetDifference !== 0 && this._canProcessNotNativeTimezoneDates(appointment)) {
                source.startDate = new Date(source.startDate.getTime() + offsetDifference * toMs('minute'));
                source.endDate = new Date(source.endDate.getTime() + offsetDifference * toMs('minute'));
            }

            const startDate = this.timeZoneCalculator.createDate(source.startDate, { path: 'toGrid' });
            const endDate = this.timeZoneCalculator.createDate(source.endDate, { path: 'toGrid' });

            return {
                startDate,
                endDate,
                source // TODO
            };
        });
    }

    _createExtremeRecurrenceDates(rawAppointment) {
        const dateRange = this.scheduler._workSpace.getDateRange();

        const startViewDate = this.scheduler.appointmentTakesAllDay(rawAppointment)
            ? dateUtils.trimTime(dateRange[0])
            : dateRange[0];

        const commonTimeZone = this.scheduler.option('timeZone');

        const minRecurrenceDate = commonTimeZone
            ? this.timeZoneCalculator.createDate(startViewDate, { path: 'fromGrid' })
            : startViewDate;

        const maxRecurrenceDate = commonTimeZone
            ? this.timeZoneCalculator.createDate(dateRange[1], { path: 'fromGrid' })
            : dateRange[1];

        return [
            minRecurrenceDate,
            maxRecurrenceDate
        ];
    }

    _createRecurrenceOptions(appointment, groupIndex) {
        const [
            minRecurrenceDate,
            maxRecurrenceDate
        ] = this._createExtremeRecurrenceDates(appointment.source(), groupIndex);

        return {
            rule: appointment.recurrenceRule,
            exception: appointment.recurrenceException,
            min: minRecurrenceDate,
            max: maxRecurrenceDate,
            firstDayOfWeek: this.scheduler.getFirstDayOfWeek(),

            start: appointment.startDate,
            end: appointment.endDate,

            getPostProcessedException: date => {
                const timeZoneName = this.scheduler.option('timeZone');
                if(isEmptyObject(timeZoneName) || timeZoneUtils.isEqualLocalTimeZone(timeZoneName, date)) {
                    return date;
                }

                const appointmentOffset = this.timeZoneCalculator.getOffsets(appointment.startDate).common;
                const exceptionAppointmentOffset = this.timeZoneCalculator.getOffsets(date).common;

                let diff = appointmentOffset - exceptionAppointmentOffset;
                diff = this._getProcessedNotNativeDateIfCrossDST(date, diff);

                return new Date(date.getTime() - diff * dateUtils.dateToMilliseconds('hour'));
            }
        };
    }

    _createRecurrenceAppointments(appointment, resources) {
        const { duration } = appointment;
        const option = this._createRecurrenceOptions(appointment);
        const generatedStartDates = getRecurrenceProcessor().generateDates(option);

        return generatedStartDates.map(date => {
            const utcDate = timeZoneUtils.createUTCDateWithLocalOffset(date);
            utcDate.setTime(utcDate.getTime() + duration);
            const endDate = timeZoneUtils.createDateFromUTCWithLocalOffset(utcDate);

            return {
                startDate: new Date(date),
                endDate: endDate
            };
        });
    }

    _cropAppointmentsByStartDayHour(appointments, rawAppointment, isAllDay) {
        return appointments.map(appointment => {
            const startDate = new Date(appointment.startDate);
            const firstViewDate = this._getAppointmentFirstViewDate(appointment, rawAppointment);
            const startDayHour = this._getViewStartDayHour(firstViewDate);

            appointment.startDate = this._getAppointmentResultDate({
                appointment,
                rawAppointment,
                startDate,
                startDayHour,
                firstViewDate
            });

            return appointment;
        });
    }
    _getAppointmentFirstViewDate() {
        return this.scheduler.getStartViewDate();
    }
    _getViewStartDayHour() {
        return this.scheduler._getCurrentViewOption('startDayHour');
    }
    _getAppointmentResultDate(options) {
        const {
            appointment,
            rawAppointment,
            startDayHour,
            firstViewDate
        } = options;
        let { startDate } = options;
        let resultDate = new Date(appointment.startDate);

        if(this.scheduler.appointmentTakesAllDay(rawAppointment)) {
            resultDate = dateUtils.normalizeDate(startDate, firstViewDate);
        } else {
            if(startDate < firstViewDate) {
                startDate = firstViewDate;
            }

            resultDate = dateUtils.normalizeDate(appointment.startDate, startDate);
        }


        return dateUtils.roundDateByStartDayHour(resultDate, startDayHour);
    }

    createAppointmentInfos(gridAppointments, resources, isAllDay, recurrent) {
        let result = [];

        for(let i = 0; i < gridAppointments.length; i++) {
            const appointment = gridAppointments[i];

            const coordinates = this.getCoordinates({
                appointment,
                resources,
                isAllDay,
                recurrent
            });

            coordinates.forEach(coordinate => {
                extend(coordinate, {
                    info: {
                        appointment: gridAppointments[i],
                        sourceAppointment: gridAppointments[i].source
                    }
                });
            });

            result = result.concat(coordinates);
        }
        return result;
    }
    getCoordinates(options) {
        const {
            appointment,
            resources,
            isAllDay
        } = options;

        return this.workspace.getCoordinatesByDateInGroup(appointment.startDate, resources, isAllDay);
    }
}

export class AppointmentSettingsGeneratorVirtualStrategy extends AppointmentSettingsGeneratorBaseStrategy {
    get viewDataProvider() { return this.workspace.viewDataProvider; }
    get isVerticalGrouping() { return this.workspace._isVerticalGroupedWorkSpace(); }

    createAppointmentInfos(gridAppointments, resources, allDay, recurrent) {
        const appointments = allDay
            ? gridAppointments
            : gridAppointments.filter(({ source, startDate, endDate }) => {
                const { groupIndex } = source;

                return this.viewDataProvider.isGroupIntersectDateInterval(groupIndex, startDate, endDate);
            });

        if(recurrent) {
            return this._createRecurrentAppointmentInfos(appointments, resources, allDay);
        }

        return super.createAppointmentInfos(appointments, resources, allDay, recurrent);
    }
    getCoordinates(options) {
        const {
            appointment,
            isAllDay,
            resources,
            recurrent
        } = options;

        const { startDate } = appointment;
        const { workspace } = this;

        const groupIndex = !recurrent
            ? appointment.source.groupIndex
            : undefined;

        return workspace.getCoordinatesByDateInGroup(startDate, resources, isAllDay, groupIndex);
    }

    _createRecurrentAppointmentInfos(gridAppointments, resources, allDay) {
        const result = [];

        gridAppointments.forEach(appointment => {
            const { source } = appointment;
            const { groupIndex } = source;

            const coordinate = this.workspace.getCoordinatesByDate(
                appointment.startDate,
                groupIndex,
                allDay
            );

            if(coordinate) {
                extend(coordinate, {
                    info: {
                        appointment,
                        sourceAppointment: source
                    }
                });

                result.push(coordinate);
            }
        });

        return result;
    }

    _cropAppointmentsByStartDayHour(appointments, rawAppointment, isAllDay) {
        return appointments.filter(appointment => {
            const firstViewDate = this._getAppointmentFirstViewDate(appointment, rawAppointment);

            if(!firstViewDate) return false;

            const startDayHour = this._getViewStartDayHour(firstViewDate);
            const startDate = new Date(appointment.startDate);

            appointment.startDate = this._getAppointmentResultDate({
                appointment,
                rawAppointment,
                startDate,
                startDayHour,
                firstViewDate
            });

            return !isAllDay
                ? appointment.endDate > appointment.startDate
                : true;
        });
    }

    _createRecurrenceAppointments(appointment, resources) {
        const { duration } = appointment;
        const result = [];
        const groupIndices = this.workspace._getGroupCount()
            ? this._getGroupIndices(resources)
            : [0];

        groupIndices.forEach(groupIndex => {
            const option = this._createRecurrenceOptions(appointment, groupIndex);
            const generatedStartDates = getRecurrenceProcessor().generateDates(option);
            const recurrentInfo = generatedStartDates
                .map(date => {
                    const startDate = new Date(date);
                    const utcDate = timeZoneUtils.createUTCDateWithLocalOffset(date);
                    utcDate.setTime(utcDate.getTime() + duration);
                    const endDate = timeZoneUtils.createDateFromUTCWithLocalOffset(utcDate);

                    return {
                        startDate,
                        endDate,
                        groupIndex
                    };
                });

            result.push(...recurrentInfo);
        });

        return result;
    }

    _getViewStartDayHour(firstViewDate) {
        return firstViewDate.getHours();
    }

    _getAppointmentFirstViewDate(appointment, rawAppointment) {
        const { viewDataProvider } = this.scheduler.getWorkSpace();
        const { groupIndex } = appointment.source;
        const {
            startDate,
            endDate
        } = appointment;

        const isAllDay = this._isAllDayAppointment(rawAppointment);

        return viewDataProvider.findGroupCellStartDate(groupIndex, startDate, endDate, isAllDay);
    }

    _updateGroupIndices(appointments, itemResources) {
        const groupIndices = this._getGroupIndices(itemResources);
        const result = [];

        groupIndices.forEach(groupIndex => {
            const groupStartDate = this.viewDataProvider.getGroupStartDate(groupIndex);
            if(groupStartDate) {
                appointments.forEach(appointment => {
                    const appointmentCopy = extend({}, appointment);
                    appointmentCopy.groupIndex = groupIndex;

                    result.push(appointmentCopy);
                });
            }
        });

        return result;
    }

    _getGroupIndices(resources) {
        let groupIndices = this.workspace._getGroupIndexes(resources);
        const { viewDataProvider } = this.workspace;
        const viewDataGroupIndices = viewDataProvider.getGroupIndices();

        if(!groupIndices?.length) {
            groupIndices = [0];
        }

        return groupIndices.filter(
            groupIndex => viewDataGroupIndices.indexOf(groupIndex) !== -1
        );
    }

    _createAppointments(appointment, resources) {
        const appointments = super._createAppointments(appointment, resources);

        return !appointment.isRecurrent
            ? this._updateGroupIndices(appointments, resources)
            : appointments;
    }
}
