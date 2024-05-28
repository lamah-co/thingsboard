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
  Component,
  forwardRef,
  HostBinding,
  Input,
  OnInit,
  QueryList,
  ViewChildren,
  ViewEncapsulation
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  UntypedFormArray,
  UntypedFormBuilder,
  UntypedFormControl,
  UntypedFormGroup,
  Validator
} from '@angular/forms';
import { IotSvgBehavior, IotSvgBehaviorType } from '@home/components/widget/lib/svg/iot-svg.models';
import { ValueType } from '@shared/models/constants';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  behaviorValid,
  ScadaSymbolBehaviorRowComponent
} from '@home/pages/scada-symbol/metadata-components/scada-symbol-behavior-row.component';
import { ValueToDataType } from '@shared/models/action-widget-settings.models';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'tb-scada-symbol-metadata-behaviors',
  templateUrl: './scada-symbol-behaviors.component.html',
  styleUrls: ['./scada-symbol-behaviors.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ScadaSymbolBehaviorsComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => ScadaSymbolBehaviorsComponent),
      multi: true
    }
  ],
  encapsulation: ViewEncapsulation.None
})
export class ScadaSymbolBehaviorsComponent implements ControlValueAccessor, OnInit, Validator {

  @HostBinding('style.display') styleDisplay = 'flex';
  @HostBinding('style.overflow') styleOverflow = 'hidden';

  @ViewChildren(ScadaSymbolBehaviorRowComponent)
  behaviorRows: QueryList<ScadaSymbolBehaviorRowComponent>;

  @Input()
  disabled: boolean;

  behaviorsFormGroup: UntypedFormGroup;

  errorText = '';

  get dragEnabled(): boolean {
    return this.behaviorsFormArray().controls.length > 1;
  }

  private propagateChange = (_val: any) => {};

  constructor(private fb: UntypedFormBuilder,
              private translate: TranslateService) {
  }

  ngOnInit() {
    this.behaviorsFormGroup = this.fb.group({
      behaviors: this.fb.array([])
    });
    this.behaviorsFormGroup.valueChanges.subscribe(
      () => {
        let behaviors: IotSvgBehavior[] = this.behaviorsFormGroup.get('behaviors').value;
        if (behaviors) {
          behaviors = behaviors.filter(b => behaviorValid(b));
        }
        this.propagateChange(behaviors);
      }
    );
  }

  registerOnChange(fn: any): void {
    this.propagateChange = fn;
  }

  registerOnTouched(fn: any): void {
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.behaviorsFormGroup.disable({emitEvent: false});
    } else {
      this.behaviorsFormGroup.enable({emitEvent: false});
    }
  }

  writeValue(value: IotSvgBehavior[] | undefined): void {
    const behaviors= value || [];
    this.behaviorsFormGroup.setControl('behaviors', this.prepareBehaviorsFormArray(behaviors), {emitEvent: false});
  }

  public validate(c: UntypedFormControl) {
    this.errorText = '';
    const behaviorsArray = this.behaviorsFormGroup.get('behaviors') as UntypedFormArray;
    const notUniqueControls =
      behaviorsArray.controls.filter(control => control.hasError('behaviorIdNotUnique'));
    for (const control of notUniqueControls) {
      control.updateValueAndValidity({onlySelf: false, emitEvent: false});
      if (control.hasError('behaviorIdNotUnique')) {
        this.errorText = this.translate.instant('scada.behavior.not-unique-behavior-ids-error');
      }
    }
    const valid =  this.behaviorsFormGroup.valid;
    return valid ? null : {
      behaviors: {
        valid: false,
      },
    };
  }

  public behaviorIdUnique(id: string, index: number): boolean {
    const behaviorsArray = this.behaviorsFormGroup.get('behaviors') as UntypedFormArray;
    for (let i = 0; i < behaviorsArray.controls.length; i++) {
      if (i !== index) {
        const otherControl = behaviorsArray.controls[i];
        if (id === otherControl.value.id) {
          return false;
        }
      }
    }
    return true;
  }

  behaviorDrop(event: CdkDragDrop<string[]>) {
    const behaviorsArray = this.behaviorsFormGroup.get('behaviors') as UntypedFormArray;
    const behavior = behaviorsArray.at(event.previousIndex);
    behaviorsArray.removeAt(event.previousIndex);
    behaviorsArray.insert(event.currentIndex, behavior);
  }

  behaviorsFormArray(): UntypedFormArray {
    return this.behaviorsFormGroup.get('behaviors') as UntypedFormArray;
  }

  trackByBehavior(index: number, behaviorControl: AbstractControl): any {
    return behaviorControl;
  }

  removeBehavior(index: number, emitEvent = true) {
    (this.behaviorsFormGroup.get('behaviors') as UntypedFormArray).removeAt(index, {emitEvent});
  }

  addBehavior() {
    const behavior: IotSvgBehavior = {
      id: '',
      name: '',
      type: IotSvgBehaviorType.value,
      valueType: ValueType.BOOLEAN,
      defaultValue: false,
      valueToDataType: ValueToDataType.CONSTANT,
      constantValue: false,
      valueToDataFunction: ''
    };
    const behaviorsArray = this.behaviorsFormGroup.get('behaviors') as UntypedFormArray;
    const behaviorControl = this.fb.control(behavior, []);
    behaviorsArray.push(behaviorControl);
    setTimeout(() => {
      const behaviorRow = this.behaviorRows.get(this.behaviorRows.length-1);
      behaviorRow.onAdd(() => {
        this.removeBehavior(behaviorsArray.length-1);
      });
    });
  }

  private prepareBehaviorsFormArray(behaviors: IotSvgBehavior[] | undefined): UntypedFormArray {
    const behaviorsControls: Array<AbstractControl> = [];
    if (behaviors) {
      behaviors.forEach((behavior) => {
        behaviorsControls.push(this.fb.control(behavior, []));
      });
    }
    return this.fb.array(behaviorsControls);
  }
}