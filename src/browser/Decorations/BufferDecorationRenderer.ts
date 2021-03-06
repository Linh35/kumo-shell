/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableDomListener } from 'browser/Lifecycle';
import { IRenderService } from 'browser/services/Services';
import { Disposable } from 'common/Lifecycle';
import { IBufferService, IDecorationService, IInternalDecoration } from 'common/services/Services';

export class BufferDecorationRenderer extends Disposable {
  private readonly _container: HTMLElement;
  private readonly _decorationElements: Map<IInternalDecoration, HTMLElement> = new Map();

  private _animationFrame: number | undefined;
  private _altBufferIsActive: boolean = false;

  constructor(
    private readonly _screenElement: HTMLElement,
    @IBufferService private readonly _bufferService: IBufferService,
    @IDecorationService private readonly _decorationService: IDecorationService,
    @IRenderService private readonly _renderService: IRenderService
  ) {
    super();

    this._container = document.createElement('div');
    this._container.classList.add('xterm-decoration-container');
    this._screenElement.appendChild(this._container);

    this.register(this._renderService.onRenderedBufferChange(() => this._queueRefresh()));
    this.register(this._renderService.onDimensionsChange(() => this._queueRefresh()));
    this.register(addDisposableDomListener(window, 'resize', () => this._queueRefresh()));
    this.register(this._bufferService.buffers.onBufferActivate(() => {
      this._altBufferIsActive = this._bufferService.buffer === this._bufferService.buffers.alt;
    }));
    this.register(this._decorationService.onDecorationRegistered(() => this._queueRefresh()));
    this.register(this._decorationService.onDecorationRemoved(decoration => this._removeDecoration(decoration)));
  }

  public override dispose(): void {
    this._container.remove();
    this._decorationElements.clear();
    super.dispose();
  }

  private _queueRefresh(): void {
    if (this._animationFrame !== undefined) {
      return;
    }
    this._animationFrame = window.requestAnimationFrame(() => {
      this.refreshDecorations();
      this._animationFrame = undefined;
    });
  }

  public refreshDecorations(): void {
    for (const decoration of this._decorationService.decorations) {
      this._renderDecoration(decoration);
    }
  }

  private _renderDecoration(decoration: IInternalDecoration): void {
    let element = this._decorationElements.get(decoration);
    if (!element) {
      element = this._createElement(decoration);
      decoration.onDispose(() => this._removeDecoration(decoration));
      decoration.marker.onDispose(() => decoration.dispose());
      decoration.element = element;
      this._decorationElements.set(decoration, element);
      this._container.appendChild(element);
    }
    this._refreshStyle(decoration, element);
    decoration.onRenderEmitter.fire(element);
  }

  private _createElement(decoration: IInternalDecoration): HTMLElement {
    const element = document.createElement('div');
    element.classList.add('xterm-decoration');
    element.style.width = `${(decoration.options.width || 1) * this._renderService.dimensions.actualCellWidth}px`;
    element.style.height = `${(decoration.options.height || 1) * this._renderService.dimensions.actualCellHeight}px`;
    element.style.top = `${(decoration.marker.line - this._bufferService.buffers.active.ydisp) * this._renderService.dimensions.actualCellHeight}px`;
    element.style.lineHeight = `${this._renderService.dimensions.actualCellHeight}px`;

    const x = decoration.options.x ?? 0;
    if (x && x > this._bufferService.cols) {
      // exceeded the container width, so hide
      element.style.display = 'none';
    }
    if ((decoration.options.anchor || 'left') === 'right') {
      element.style.right = x ? `${x * this._renderService.dimensions.actualCellWidth}px` : '';
    } else {
      element.style.left = x ? `${x * this._renderService.dimensions.actualCellWidth}px` : '';
    }

    return element;
  }

  private _refreshStyle(decoration: IInternalDecoration, element: HTMLElement): void {
    const line = decoration.marker.line - this._bufferService.buffers.active.ydisp;
    if (line < 0 || line >= this._bufferService.rows) {
      // outside of viewport
      element.style.display = 'none';
    } else {
      element.style.top = `${line * this._renderService.dimensions.actualCellHeight}px`;
      element.style.display = this._altBufferIsActive ? 'none' : 'block';
    }
  }

  private _removeDecoration(decoration: IInternalDecoration): void {
    this._decorationElements.get(decoration)?.remove();
    this._decorationElements.delete(decoration);
  }
}
