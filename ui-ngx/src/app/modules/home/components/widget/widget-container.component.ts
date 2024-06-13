///
/// Copyright © 2016-2024 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import { PageComponent } from '@shared/components/page.component';
import { DashboardWidget, DashboardWidgets } from '@home/models/dashboard-component.models';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { SafeStyle } from '@angular/platform-browser';
import { isNotEmptyStr } from '@core/utils';
import { GridsterItemComponent } from 'angular-gridster2';
import { UtilsService } from '@core/services/utils.service';
// * --------------------------------- * //
import { WidgetContext } from '@home/models/widget-component.models';
import {Datasource, DatasourceData } from '@app/shared/models/widget.models';
import * as XLSX from 'xlsx';
import _ from 'lodash';
// * --------------------------------- * //

export enum WidgetComponentActionType {
  MOUSE_DOWN,
  CLICKED,
  CONTEXT_MENU,
  EDIT,
  EXPORT,
  REMOVE
}

export class WidgetComponentAction {
  event: MouseEvent;
  actionType: WidgetComponentActionType;
}

// @dynamic
@Component({
  selector: 'tb-widget-container',
  templateUrl: './widget-container.component.html',
  styleUrls: ['./widget-container.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WidgetContainerComponent extends PageComponent implements OnInit, AfterViewInit, OnDestroy {

  @HostBinding('class')
  widgetContainerClass = 'tb-widget-container';

  @ViewChild('tbWidgetElement', {static: true})
  tbWidgetElement: ElementRef;

  @Input()
  gridsterItem: GridsterItemComponent;

  @Input()
  widget: DashboardWidget;

  @Input()
  dashboardStyle: {[klass: string]: any};

  @Input()
  backgroundImage: SafeStyle | string;

  @Input()
  isEdit: boolean;

  @Input()
  isPreview: boolean;

  @Input()
  isMobile: boolean;

  @Input()
  dashboardWidgets: DashboardWidgets;

  @Input()
  isEditActionEnabled: boolean;

  @Input()
  isExportActionEnabled: boolean;

  @Input()
  isRemoveActionEnabled: boolean;

  @Input()
  disableWidgetInteraction = false;

  @Output()
  widgetFullscreenChanged: EventEmitter<boolean> = new EventEmitter<boolean>();

  @Output()
  widgetComponentAction: EventEmitter<WidgetComponentAction> = new EventEmitter<WidgetComponentAction>();

  private cssClass: string;

  constructor(protected store: Store<AppState>,
              private cd: ChangeDetectorRef,
              private renderer: Renderer2,
              private utils: UtilsService) {
    super(store);
  }

  ngOnInit(): void {
    this.widget.widgetContext.containerChangeDetector = this.cd;
    const cssString = this.widget.widget.config.widgetCss;
    if (isNotEmptyStr(cssString)) {
      this.cssClass =
        this.utils.applyCssToElement(this.renderer, this.gridsterItem.el, 'tb-widget-css', cssString);
    }
  }

  ngAfterViewInit(): void {
    this.widget.widgetContext.$widgetElement = $(this.tbWidgetElement.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.cssClass) {
      this.utils.clearCssElement(this.renderer, this.cssClass);
    }
  }

  isHighlighted(widget: DashboardWidget) {
    return this.dashboardWidgets.isHighlighted(widget);
  }

  isNotHighlighted(widget: DashboardWidget) {
    return this.dashboardWidgets.isNotHighlighted(widget);
  }

  onFullscreenChanged(expanded: boolean) {
    if (expanded) {
      this.renderer.addClass(this.tbWidgetElement.nativeElement, this.cssClass);
    } else {
      this.renderer.removeClass(this.tbWidgetElement.nativeElement, this.cssClass);
    }
    this.widgetFullscreenChanged.emit(expanded);
  }

  // * --------------------------------- * //
  exportData($event: Event, ctx: WidgetContext, fileType: XLSX.BookType) {
  	if ($event) {
      $event.stopPropagation();
    }
    const formatedData = this.dataFormat(ctx.datasources, ctx.data);
    this.export(formatedData, fileType, ctx.widgetConfig.title);
}

/**
   * Format the data into a format similar to the following
   [
   ['name', 'type', 'timestamp', 'dataKey1','dataKey1',...],
   ['BusA', 'Device', 1617851898356, 9.3,'on',...],
   ['BusB', 'Device', 1617851898356, 9.3,'off',...],
   ['AssertA', 'Assert', 1617851898356, 9.3,'location1',...],
   ['AssertB', 'Assert', 1617851898356, 9.3,'location2',...]
   ]
   * @param datasources Use console.log(datasources) to view the specific data format of datasources
   * @param data Use console.log(data) to view the specific data format of data
   */
   dataFormat(datasources: Datasource[], data: DatasourceData[]) {
    let aggregation = [];
    const header = ['timestamp', 'name', 'type'];
    let firstHeader = true;
    datasources.forEach(ds => {
      let entity = [];
      let firstTs = true;
      ds.dataKeys.forEach(dk => {
        if (firstHeader) {
          header.push(dk.name);
        }
        data.forEach(dt => {
          if (dt.dataKey.name === dk.name && dt.datasource.name === ds.entityName) {
            entity.push([dk.name, _.flatMap(dt.data, (arr) => arr[1])]);
            if ((dt.data[0] && dt.data[0][0]) && firstTs) {
              firstTs = false;
              entity.splice(0, 0, ['timestamp', _.flatMap(dt.data, (arr) => arr[0].toString())]);
            }
          }
        });
      });
      firstHeader = false;
      aggregation.push([ds.entityName, ds.entityType, entity]);
    });
    
    let result = [];
    aggregation.forEach((item, i) => {
      let entityName = item[0];
      let entityType = item[1];
      let v = item[2];

      const dataKeyData = v.filter(item => item[1].length > 0)[0]
      if(dataKeyData){
        for (let i = 0; i < dataKeyData[1].length; i++) {
          let row = [];
          v.forEach((_item, j) => {
            if (j == 0) {
              row[0] = _item[1][i];
              row[1] = entityName;
              row[2] = entityType;
            } else {
              row[j + 2] = _item[1][i] ? _item[1][i] : '';
            }
          });
          result.push(row);
        }
      }
    });
    result.splice(0, 0, header);
    return result;
  }

  export(data: Array<any>, fileType: XLSX.BookType, title: string): void {
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = ([
      { wch: 13 }
    ]);
    const output_file_name = `${title}-${Date.now()}.${fileType}`;
    
    if (fileType === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';', RS: '\n' });
      this.exportCSV(csv, output_file_name);
    } else {
      const wb: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, output_file_name, { bookType: fileType });
    }
  }
  
  exportCSV(csvData: string, fileName: string): void {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) { // feature detection
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
  // * --------------------------------- * //

  onMouseDown(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.MOUSE_DOWN
    });
  }

  onClicked(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.CLICKED
    });
  }

  onContextMenu(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.CONTEXT_MENU
    });
  }

  onEdit(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.EDIT
    });
  }

  onExport(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.EXPORT
    });
  }

  onRemove(event: MouseEvent) {
    this.widgetComponentAction.emit({
      event,
      actionType: WidgetComponentActionType.REMOVE
    });
  }

}
